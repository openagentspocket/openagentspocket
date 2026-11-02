/**
 * Text a person reads, kept unresolved so core stays free of any i18n runtime.
 *
 * - a plain `string` is the failure's own words (a path, herdr's message, a detail line): never
 *   translated;
 * - a `Message` is a catalog entry: `key` is the Swift String Catalog key verbatim (the English
 *   source with `%@` placeholders), `args` fill the placeholders in order. The i18n layer converts
 *   that catalog, so the key is the join point and no second copy of the wording lives here;
 * - a `Joined` list renders its parts with a fixed separator (route lists, "route: summary").
 */
export interface Message {
  readonly key: string;
  readonly args?: readonly Text[];
}

export interface Joined {
  readonly join: readonly Text[];
  readonly separator: string;
}

export type Text = string | Message | Joined;

/** Looks up a catalog key and fills its `%@` placeholders with already-rendered arguments. */
export type Translate = (key: string, args: readonly string[]) => string;

export function message(key: string, ...args: Text[]): Message {
  return args.length > 0 ? { key, args } : { key };
}

/** The catalog's source language: the key itself with its placeholders filled in order. */
export const sourceText: Translate = (key, args) => {
  let next = 0;
  return key.replace(/%(?:@|lld)/g, () => args[next++] ?? '');
};

export function renderText(text: Text, translate: Translate = sourceText): string {
  if (typeof text === 'string') return text;
  if ('join' in text)
    return text.join.map((part) => renderText(part, translate)).join(text.separator);
  return translate(
    text.key,
    (text.args ?? []).map((arg) => renderText(arg, translate)),
  );
}
