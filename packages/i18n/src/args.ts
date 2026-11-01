/**
 * The arguments a key takes, read from the key itself: a Swift catalog key carries the format
 * specifiers of its interpolations in reading order (`%@` a string, `%lld`/`%d` a number, `%%` a
 * literal), and App Intents keys name theirs (`${agent}`).
 *   ArgsOf<'%lld of %lld'>   → [number, number]
 *   ArgsOf<'Open ${agent}'>  → [{ agent: string }]
 *   ArgsOf<'Needs you'>      → []
 */
type Positional<S extends string> = S extends `${string}%${infer Rest}`
  ? Rest extends `%${infer Tail}`
    ? Positional<Tail>
    : Rest extends `@${infer Tail}`
      ? [string, ...Positional<Tail>]
      : Rest extends `lld${infer Tail}`
        ? [number, ...Positional<Tail>]
        : Rest extends `ld${infer Tail}`
          ? [number, ...Positional<Tail>]
          : Rest extends `d${infer Tail}`
            ? [number, ...Positional<Tail>]
            : Positional<Rest>
  : [];

type Named<S extends string> = S extends `${string}\${${infer Name}}${infer Rest}`
  ? Name | Named<Rest>
  : never;

export type ArgsOf<K extends string> = [Named<K>] extends [never]
  ? Positional<K>
  : [Readonly<Record<Named<K>, string>>];
