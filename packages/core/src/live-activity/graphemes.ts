type Segmenter = { segment(text: string): Iterable<{ segment: string }> };
type SegmenterConstructor = new (
  locale: string | undefined,
  options: { granularity: 'grapheme' },
) => Segmenter;

function segmenter(): Segmenter | undefined {
  const ctor = (Intl as unknown as { Segmenter?: SegmenterConstructor }).Segmenter;
  return ctor ? new ctor(undefined, { granularity: 'grapheme' }) : undefined;
}

/** The first `max` user-perceived characters; code points where Intl.Segmenter is missing. */
export function prefixGraphemes(text: string, max: number): string {
  if (text.length <= max) return text;
  const seg = segmenter();
  const parts = seg ? Array.from(seg.segment(text), (s) => s.segment) : [...text];
  return parts.length <= max ? text : parts.slice(0, max).join('');
}
