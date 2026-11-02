import type { ArgsOf } from './args';
import { catalogs } from './catalogs.generated';
import { formatMessage, type MessageArgs } from './format';
import { getLocale, getLocaleTag } from './locale';
import type { Locale } from './plural';

export type { ArgsOf } from './args';
export { catalogSources } from './catalogs.generated';
export { formatMessage, type MessageArgs, MessageSyntaxError, messageArguments } from './format';
export { deviceLocaleTag, getLocale, getLocaleTag, resolveLocale, setLocale } from './locale';
export { type Locale, locales, type PluralCategory, pluralCategory } from './plural';

/** A catalog table: `app` is the main app's Localizable; the rest mirror Swift tables/targets. */
export type Table = keyof (typeof catalogs)['en'];
/** Every key of the main app table: the Swift catalog key, verbatim (`'%lld blocked'`). */
export type AppKey = keyof (typeof catalogs)['en']['app'] & string;

export const tables = Object.keys(catalogs.en) as Table[];

const table = (locale: Locale, name: Table) =>
  catalogs[locale][name] as Readonly<Record<string, string>>;

/** The ICU message for a key, falling back to English; undefined when no table has it. */
export function message(locale: Locale, name: Table, key: string): string | undefined {
  return table(locale, name)[key] ?? table('en', name)[key];
}

/** The keys a table ships (the same in every locale). */
export function keysOf(name: Table): string[] {
  return Object.keys(table('en', name));
}

/**
 * Translates a key of any table with explicit arguments: positional (`['a', 2]`) for Swift
 * format keys, named (`{ agent: 'a' }`) for App Intents keys. A missing key renders as itself,
 * as Foundation does.
 */
export function translate(
  locale: Locale,
  name: Table,
  key: string,
  args?: MessageArgs,
  numberLocale: string = locale,
): string {
  const icu = message(locale, name, key);
  return icu === undefined ? key : formatMessage(icu, args, locale, numberLocale);
}

/**
 * Translates a main-app key in the current locale. The key is the Swift catalog key, so a
 * SwiftUI `Text("\(count) blocked")` ports to `t('%lld blocked', count)`; the argument types
 * come from the key's specifiers.
 */
export function t<K extends AppKey>(key: K, ...args: ArgsOf<K>): string {
  const [first] = args;
  const values: MessageArgs =
    args.length === 1 && typeof first === 'object' && first !== null ? first : args;
  return translate(getLocale(), 'app', key, values, getLocaleTag());
}
