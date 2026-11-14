import { Platform } from 'react-native';

/** The curve of a corner: `continuous` is iOS's squircle. Fits view, text and image styles. */
interface Curve {
  borderCurve?: 'circular' | 'continuous';
}

/** iOS draws a corner as a continuous curve (squircle); elsewhere the property does nothing. */
export const continuousCurve: Curve = Platform.OS === 'ios' ? { borderCurve: 'continuous' } : {};

/** A corner from the radius scale (`t.radius.control`), drawn with the iOS continuous curve. */
export function rounded(corner: number): Curve & { borderRadius: number } {
  return { borderRadius: corner, ...continuousCurve };
}
