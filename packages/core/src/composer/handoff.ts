/**
 * Text another screen hands to an Agent's Composer lands as its own paragraph after whatever the
 * user already typed; it never replaces a draft. Trailing whitespace of the draft is folded into the
 * paragraph break, and blank text leaves the draft as it was.
 */
export function appendParagraph(draft: string, text: string): string {
  const paragraph = text.trim();
  if (paragraph === '') return draft;
  const kept = draft.trimEnd();
  return kept === '' ? paragraph : `${kept}\n\n${paragraph}`;
}
