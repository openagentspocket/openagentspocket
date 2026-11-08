/**
 * The iOS text styles at the Large setting (points; they scale with the system text size). `Text`
 * variants draw them; a text input reads its size here. `label` is a semibold caption, `mono` a
 * footnote that `Text` sets in the monospaced face.
 */
export const typography = {
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: '400' },
  title: { fontSize: 34, lineHeight: 41, fontWeight: '700' },
  title1: { fontSize: 28, lineHeight: 34, fontWeight: '400' },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 17, lineHeight: 22, fontWeight: '400' },
  callout: { fontSize: 16, lineHeight: 21, fontWeight: '400' },
  subheadline: { fontSize: 15, lineHeight: 20, fontWeight: '400' },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
  caption2: { fontSize: 11, lineHeight: 13, fontWeight: '400' },
  label: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  mono: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
} as const;

export type TextVariant = keyof typeof typography;
