import { graphemeSegmenter } from '../intl';

/** The first `max` user-perceived characters; code points where Intl.Segmenter is missing. */
export function prefixGraphemes(text: string, max: number): string {
  if (text.length <= max) return text;
  const seg = graphemeSegmenter();
  const parts = seg ? Array.from(seg.segment(text), (s) => s.segment) : [...text];
  return parts.length <= max ? text : parts.slice(0, max).join('');
}
