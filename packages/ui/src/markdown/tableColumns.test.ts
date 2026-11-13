import { type TableMetrics, tableColumnWidths } from './tableColumns';

const cell = (text: string) => ({ text });
const METRICS: TableMetrics = { fontSize: 16, cellInset: 9 };
const sum = (widths: number[]) => widths.reduce((total, width) => total + width, 0);

/** Each column's width for its longest word alone: what it can never go below. */
const wordFloors = (rows: { text: string }[][]) =>
  tableColumnWidths(
    rows.map((row) =>
      row.map((c) => cell(c.text.split(/\s+/u).sort((a, b) => b.length - a.length)[0] ?? '')),
    ),
    METRICS,
  );

const CONTEXT = [
  [cell('Category'), cell('Tokens'), cell('Percentage')],
  [cell('System prompt'), cell('5.6k'), cell('2.8%')],
  [cell('Free space'), cell('161k'), cell('80.5%')],
];

describe('tableColumnWidths', () => {
  it('gives every row of a column the same width, from its longest cell', () => {
    const widths = tableColumnWidths(
      [
        [cell('a'), cell('Longer heading')],
        [cell('bb'), cell('x')],
      ],
      METRICS,
    );
    expect(widths).toHaveLength(2);
    expect(widths[1]).toBeGreaterThan(widths[0] as number);
  });

  it('never makes a column narrower than its longest word, however little room there is', () => {
    const floors = wordFloors(CONTEXT);
    for (const available of [undefined, 400, 200, 50]) {
      const widths = tableColumnWidths(CONTEXT, { ...METRICS, available });
      widths.forEach((width, column) => {
        expect(width).toBeGreaterThanOrEqual(floors[column] as number);
      });
    }
  });

  it('a word takes more room than its letters at the cell font size, plus the inset', () => {
    const [width] = tableColumnWidths([[cell('Percentage')]], METRICS);
    // Ten letters of a 16 pt proportional font are wider than half an em each.
    expect(width).toBeGreaterThan(10 * 16 * 0.5 + METRICS.cellInset);
  });

  it('gives the room left to the column with the most text, keeping the short ones as they were', () => {
    const natural = tableColumnWidths(CONTEXT, METRICS);
    const filled = tableColumnWidths(CONTEXT, { ...METRICS, available: sum(natural) + 100 });
    expect(sum(filled)).toBe(sum(natural) + 100);
    expect(filled[0]).toBe((natural[0] as number) + 100);
    expect(filled.slice(1)).toEqual(natural.slice(1));
  });

  it('narrows long text down to its longest word before the table scrolls', () => {
    const rows = [[cell('a description that goes on for a good while'), cell('42')]];
    const natural = tableColumnWidths(rows, METRICS);
    const squeezed = tableColumnWidths(rows, { ...METRICS, available: sum(natural) - 60 });
    expect(squeezed[0]).toBeLessThan(natural[0] as number);
    expect(squeezed[1]).toBe(natural[1]);
    // Past the words' floor it stays there, wider than the room: the table scrolls.
    const floors = wordFloors(rows);
    const tight = tableColumnWidths(rows, { ...METRICS, available: 10 });
    expect(tight).toEqual(floors);
  });

  it('caps a long cell so it wraps between words', () => {
    const rows = [[cell('word '.repeat(200))]];
    const [width] = tableColumnWidths(rows, METRICS);
    expect(width).toBeLessThan(400);
  });

  it('copes with a row shorter than the header', () => {
    expect(tableColumnWidths([[cell('a'), cell('b')], [cell('c')]], METRICS)).toHaveLength(2);
  });
});
