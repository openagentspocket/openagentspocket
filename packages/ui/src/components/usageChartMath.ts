export interface Point {
  x: number;
  y: number;
}

const round = (value: number) => Math.round(value * 100) / 100;

/** A smooth SVG path through `points` (Catmull-Rom turned into cubic Béziers). */
export function smoothPath(points: readonly Point[]): string {
  const first = points[0];
  if (!first) return '';
  let path = `M${round(first.x)},${round(first.y)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p1 = points[i] ?? first;
    const p0 = points[i - 1] ?? p1;
    const p2 = points[i + 1] ?? p1;
    const p3 = points[i + 2] ?? p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    path += `C${round(c1.x)},${round(c1.y)} ${round(c2.x)},${round(c2.y)} ${round(p2.x)},${round(p2.y)}`;
  }
  return path;
}

/** The tallest value across all series, never below 0. */
export function chartMax(series: readonly { points: readonly number[] }[]): number {
  return Math.max(0, ...series.flatMap((s) => s.points.filter(Number.isFinite)));
}

/** A round axis ceiling at or above `value` (1, 2, 4, 5 or 10 times a power of ten). */
export function niceCeiling(value: number): number {
  if (!(value > 0)) return 1;
  const exponent = 10 ** Math.floor(Math.log10(value));
  const fraction = value / exponent;
  const step = [1, 2, 4, 5, 10].find((candidate) => fraction <= candidate) ?? 10;
  return step * exponent;
}

/** The day index under a touch at `x` in a chart `width` wide with `count` days. */
export function scrubIndex(x: number, width: number, count: number): number {
  if (count <= 1 || width <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.round((x / width) * (count - 1))));
}
