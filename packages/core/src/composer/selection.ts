export interface Selection {
  readonly start: number;
  readonly end: number;
}

export function clampSelection(selection: Selection, length: number): Selection {
  const start = Math.min(Math.max(selection.start, 0), length);
  const end = Math.min(Math.max(selection.end, start), length);
  return { start, end };
}

export function sameSelection(a: Selection, b: Selection): boolean {
  return a.start === b.start && a.end === b.end;
}
