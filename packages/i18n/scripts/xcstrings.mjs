// Converts Apple String Catalogs (.xcstrings) into ICU MessageFormat catalogs, one per locale.
// Pure functions plus catalog discovery; the CLI is convert-xcstrings.mjs.
//
// Rules (they mirror what Foundation does with the Swift catalogs):
// - A key with at least one argument specifier is a format string: `%@` becomes `{n}`, `%lld`/`%d`
//   become `{n, number}`, `%%` becomes `%`, and `%2$@` keeps its position (n = 1). A key without
//   arguments is literal text (Swift never formats it), so a stray `%` stays as written.
// - A plural variation becomes `{n, plural, one {...} other {...}}` on its only numeric argument,
//   with `#` for the count; Apple's `zero` case becomes the exact match `=0`.
// - App Intents placeholders (`${agent}`) become named arguments (`{agent}`).
// - The English value is the catalog's `en` localization when it has one, else the key itself;
//   Spanish falls back to English only for keys marked "don't translate".
// - The only rewrite is the product name: literal text says OpenAgentsPocket where Swift says
//   Agentico (see `brand`). Keys stay as the Swift source wrote them.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const LOCALES = ['en', 'es'];

const SPECIFIER =
  /%%|%(?:(\d+)\$)?[-+ #0']*\d*(?:\.\d+)?(?:hh|h|ll|l|q|z|t|j|L)?([@dDuUxXoOfFeEgGcCsSpaAi])/g;
const NAMED = /\$\{(\w+)\}/g;
/** The product name of this app, which replaces the Swift app's name in every user-facing value. */
export const BRAND = 'OpenAgentsPocket';

/** Swift value text as this app says it. */
export const brand = (text) => text.replace(/\bAgentico\b/g, BRAND);

const PLURAL_ORDER = ['zero', 'one', 'two', 'few', 'many', 'other'];

/** The arguments a Swift format string reads, as `{ index, kind }` in reading order. */
export function specifiersOf(text) {
  const args = [];
  let next = 0;
  for (const match of text.matchAll(SPECIFIER)) {
    if (match[0] === '%%') continue;
    const conversion = match[2];
    let kind;
    if (conversion === '@') kind = 'string';
    else if ('dDiuU'.includes(conversion)) kind = 'number';
    else throw new Error(`unsupported format specifier ${match[0]} in ${JSON.stringify(text)}`);
    const index = match[1] ? Number(match[1]) - 1 : next++;
    args.push({ index, kind });
  }
  return args;
}

/** Splits text into literal runs and arguments. `format` decides whether `%` means anything. */
export function tokenize(text, format) {
  const tokens = [];
  const pushText = (raw) => {
    const value = brand(raw);
    let last = 0;
    for (const match of value.matchAll(NAMED)) {
      if (match.index > last) tokens.push({ type: 'text', value: value.slice(last, match.index) });
      tokens.push({ type: 'named', name: match[1] });
      last = match.index + match[0].length;
    }
    if (last < value.length) tokens.push({ type: 'text', value: value.slice(last) });
  };
  if (!format) {
    pushText(text);
    return tokens;
  }
  let last = 0;
  let next = 0;
  for (const match of text.matchAll(SPECIFIER)) {
    pushText(text.slice(last, match.index));
    last = match.index + match[0].length;
    if (match[0] === '%%') {
      pushText('%');
      continue;
    }
    const [arg] = specifiersOf(match[0]);
    tokens.push({ type: 'arg', index: match[1] ? Number(match[1]) - 1 : next++, kind: arg.kind });
  }
  pushText(text.slice(last));
  return tokens;
}

const SYNTAX = /[{}]/;
const AFTER_APOSTROPHE = /[{}#'<>|]/;

/** Escapes literal text for ICU: quotes braces (and `#` inside a plural), doubles risky `'`. */
export function escapeText(text, inPlural) {
  const special = (char) => SYNTAX.test(char) || (inPlural && char === '#');
  let out = '';
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    if (special(char)) {
      // Quote the whole run of syntax characters (apostrophes inside it are doubled).
      let run = '';
      while (i < text.length && (special(text[i]) || text[i] === "'")) {
        run += text[i] === "'" ? "''" : text[i];
        i++;
      }
      out += `'${run}'`;
      continue;
    }
    if (char === "'") {
      const following = text[i + 1];
      out += following === undefined || AFTER_APOSTROPHE.test(following) ? "''" : "'";
      i++;
      continue;
    }
    out += char;
    i++;
  }
  return out;
}

function render(tokens, pluralIndex) {
  return tokens
    .map((token) => {
      if (token.type === 'text') return escapeText(token.value, pluralIndex !== undefined);
      if (token.type === 'named') return `{${token.name}}`;
      if (token.index === pluralIndex) return '#';
      return token.kind === 'number' ? `{${token.index}, number}` : `{${token.index}}`;
    })
    .join('');
}

/** Converts one Swift string (the key or a stringUnit value) to ICU. */
export function textToIcu(text, format) {
  return render(tokenize(text, format));
}

function pluralToIcu(cases, format, where) {
  const branches = PLURAL_ORDER.filter((category) => category in cases).map((category) => {
    const value = cases[category]?.stringUnit?.value;
    if (typeof value !== 'string')
      throw new Error(`${where}: plural case ${category} has no value`);
    return [category, tokenize(value, format)];
  });
  for (const category of Object.keys(cases)) {
    if (!PLURAL_ORDER.includes(category)) throw new Error(`${where}: unknown plural ${category}`);
  }
  if (!branches.some(([category]) => category === 'other'))
    throw new Error(`${where}: plural without "other"`);
  const numeric = new Set(
    branches.flatMap(([, tokens]) =>
      tokens.filter((t) => t.type === 'arg' && t.kind === 'number').map((t) => t.index),
    ),
  );
  if (numeric.size !== 1)
    throw new Error(`${where}: a plural needs exactly one numeric argument, found ${numeric.size}`);
  const [selector] = numeric;
  const options = branches
    .map(
      ([category, tokens]) =>
        `${category === 'zero' ? '=0' : category} {${render(tokens, selector)}}`,
    )
    .join(' ');
  return `{${selector}, plural, ${options}}`;
}

function localizationToIcu(localization, format, where) {
  const kinds = Object.keys(localization).sort().join('+');
  if (kinds === 'stringUnit') return textToIcu(localization.stringUnit.value, format);
  if (kinds === 'variations') {
    const types = Object.keys(localization.variations).join('+');
    if (types === 'plural') return pluralToIcu(localization.variations.plural, format, where);
    throw new Error(`${where}: unsupported variations ${types}`);
  }
  throw new Error(`${where}: unsupported localization ${kinds}`);
}

/** Converts one catalog entry to `{ en, es }` ICU messages. */
export function convertEntry(key, entry, where = key) {
  const format = specifiersOf(key).length > 0;
  const localizations = entry.localizations ?? {};
  const en = localizations.en
    ? localizationToIcu(localizations.en, format, `${where} [en]`)
    : textToIcu(key, format);
  const es = localizations.es ? localizationToIcu(localizations.es, format, `${where} [es]`) : en;
  return { en, es };
}

/** Converts a parsed .xcstrings file to `{ en: {key: icu}, es: {key: icu}, skipped: [keys] }`. */
export function convertCatalog(catalog, name = 'catalog') {
  if ((catalog.sourceLanguage ?? 'en') !== 'en')
    throw new Error(`${name}: source language ${catalog.sourceLanguage} is not en`);
  const out = { en: {}, es: {}, skipped: [] };
  for (const [key, entry] of Object.entries(catalog.strings ?? {})) {
    // A stale key is no longer in the Swift code; Xcode keeps it only until the next cleanup.
    if (entry.extractionState === 'stale') {
      out.skipped.push(key);
      continue;
    }
    const { en, es } = convertEntry(key, entry, `${name}: ${JSON.stringify(key)}`);
    out.en[key] = en;
    out.es[key] = es;
  }
  return out;
}

const lowerFirst = (text) => text.charAt(0).toLowerCase() + text.slice(1);

/**
 * The Swift catalogs as `{ table, path }`, path relative to the Swift checkout. The app's own
 * catalogs live in Sources/Agentico/Resources (Localizable is the `app` table); each extension
 * target ships a Localizable.xcstrings of its own (AgenticoWidgets is the `widgets` table).
 */
export function discoverCatalogs(swiftDir) {
  const found = [];
  const resources = join(swiftDir, 'Sources/Agentico/Resources');
  for (const file of readdirSync(resources).sort()) {
    if (!file.endsWith('.xcstrings')) continue;
    const base = file.replace(/\.xcstrings$/, '');
    const table = base === 'Localizable' ? 'app' : lowerFirst(base);
    found.push({ table, path: `Sources/Agentico/Resources/${file}` });
  }
  for (const target of readdirSync(join(swiftDir, 'Sources')).sort()) {
    if (target === 'Agentico' || !target.startsWith('Agentico')) continue;
    const path = `Sources/${target}/Localizable.xcstrings`;
    if (existsSync(join(swiftDir, path)))
      found.push({ table: lowerFirst(target.slice('Agentico'.length)), path });
  }
  return found.sort((a, b) => a.table.localeCompare(b.table));
}

/** Reads and converts every discovered catalog. */
export function convertSwiftCatalogs(swiftDir) {
  return discoverCatalogs(swiftDir).map(({ table, path }) => ({
    table,
    path,
    ...convertCatalog(JSON.parse(readFileSync(join(swiftDir, path), 'utf8')), path),
  }));
}
