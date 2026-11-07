import { tableColumnWidths } from './tableColumns';

const cell = (text: string) => ({ text });

describe('tableColumnWidths', () => {
  it('gives every row of a column the same width, from its longest cell', () => {
    const widths = tableColumnWidths([
      [cell('a'), cell('Longer heading')],
      [cell('bb'), cell('x')],
    ]);
    expect(widths).toHaveLength(2);
    expect(widths[1]).toBeGreaterThan(widths[0] as number);
  });

  it('keeps short columns tappable and caps long ones so they wrap', () => {
    const [short, long] = tableColumnWidths([[cell(''), cell('x'.repeat(500))]]);
    expect(short).toBe(72);
    expect(long).toBe(260);
  });

  it('copes with a row shorter than the header', () => {
    expect(tableColumnWidths([[cell('a'), cell('b')], [cell('c')]])).toHaveLength(2);
  });
});
