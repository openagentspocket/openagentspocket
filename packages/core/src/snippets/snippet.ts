import { containsOnlySafeScalars, normalizingNewlines } from '../terminal/text-safety';

export type SnippetValidationError =
  | { kind: 'emptyBody' }
  | { kind: 'bodyTooLong'; limit: number }
  | { kind: 'unsupportedControlCharacters' };

/** Thrown by `makeSnippet` when the text cannot become a safe Snippet. */
export class SnippetValidationFailure extends Error {
  override readonly name = 'SnippetValidationFailure';
  constructor(readonly error: SnippetValidationError) {
    super(`SnippetValidationError.${error.kind}`);
  }
}

/** A phrase the user writes once and reuses. The title is optional. */
export interface Snippet {
  readonly id: string;
  readonly title: string;
  readonly body: string;
}

export const SNIPPET_BODY_CHARACTER_LIMIT = 4000;

export function newSnippetId(): string {
  const hex = () =>
    Math.floor(Math.random() * 0x100000000)
      .toString(16)
      .padStart(8, '0');
  return `${hex()}-${hex()}-${hex()}-${hex()}`;
}

/**
 * The only way to build a Snippet. Normalisation and the character policy live here rather than
 * at send time, so a Snippet that exists is safe to insert: the user learns at the editor.
 * Characters are counted as code points.
 */
export function makeSnippet(input: { id?: string; title: string; body: string }): Snippet {
  const body = normalizingNewlines(input.body);
  if (body.trim() === '') throw new SnippetValidationFailure({ kind: 'emptyBody' });
  if ([...body].length > SNIPPET_BODY_CHARACTER_LIMIT) {
    throw new SnippetValidationFailure({
      kind: 'bodyTooLong',
      limit: SNIPPET_BODY_CHARACTER_LIMIT,
    });
  }
  if (!containsOnlySafeScalars(body)) {
    throw new SnippetValidationFailure({ kind: 'unsupportedControlCharacters' });
  }
  return { id: input.id ?? newSnippetId(), title: input.title.trim(), body };
}

/** The row's first line: a Snippet without a title shows its body instead of a blank. */
export function snippetDisplayTitle(snippet: Snippet): string {
  return snippet.title === '' ? snippet.body : snippet.title;
}

/** The row's second line, or undefined when the first line is already the body. */
export function snippetDisplaySubtitle(snippet: Snippet): string | undefined {
  return snippet.title === '' ? undefined : snippet.body;
}

/** Case- and diacritic-insensitive containment, the "localized standard" search of the Swift app. */
export function foldedContains(haystack: string, needle: string): boolean {
  const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  return fold(haystack).includes(fold(needle));
}
