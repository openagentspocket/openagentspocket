/** Intensity steps of the heat map: 0 is the empty track, 4 the busiest day. */
export const HEAT_LEVELS = 5;

/** The step of a day's `value` against the busiest day `max`; 0 for no usage. */
export function heatLevel(value: number, max: number): number {
  if (!(value > 0) || !(max > 0)) return 0;
  return Math.min(HEAT_LEVELS - 1, Math.max(1, Math.ceil((value / max) * (HEAT_LEVELS - 1))));
}

/** Cells grouped into weeks of 7; `leading` null cells pad the first week and the last is padded too. */
export function heatRows<T>(days: readonly T[], leading: number): (T | null)[][] {
  const cells: (T | null)[] = [
    ...Array.from({ length: Math.max(0, leading) }, () => null),
    ...days,
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (T | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}
