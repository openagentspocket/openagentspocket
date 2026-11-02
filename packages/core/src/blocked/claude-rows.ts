import type { ClaudeOptionBlock } from './claude-models';
import { isRule, joinWrapped } from './row-scanner';
import {
  type AnsiScreen,
  normalizedSpaces,
  rowIndent,
  rowIsBlank,
  type ScreenRow,
  sameColor,
  trimmedText,
  visibleRuns,
} from './screen';

const EMPTY_ROW: ScreenRow = { index: -1, runs: [], text: '', width: 0 };

/** Row-level helpers the Claude reader shares: wrapped-text joins, region tests, paragraphs. */
export class ClaudeRows {
  readonly rows: readonly ScreenRow[];
  readonly columns: number;
  readonly fullWidth: number;

  constructor(
    screen: AnsiScreen,
    readonly block: ClaudeOptionBlock,
  ) {
    this.rows = screen.rows;
    this.columns = screen.columns;
    this.fullWidth = Math.max(8, screen.columns - 4);
  }

  /** The row at an index; a blank row past the ends (Swift would trap there). */
  at(index: number): ScreenRow {
    return this.rows[index] ?? EMPTY_ROW;
  }

  join(head: string, tail: string, after: ScreenRow, boxColumn: number): string {
    return joinWrapped(
      normalizedSpaces(head),
      normalizedSpaces(tail),
      'claude',
      after,
      this.columns,
      boxColumn,
    );
  }

  /** The rows joined as wrapped text. */
  joinRows(group: readonly ScreenRow[]): string {
    let text = '';
    let previous: ScreenRow | undefined;
    for (const row of group) {
      if (rowIsBlank(row)) continue;
      text = previous
        ? this.join(text, trimmedText(row), previous, rowIndent(row) ?? 0)
        : trimmedText(row);
      previous = row;
    }
    return text;
  }

  /** Consecutive non-blank rows joined as wrapped text; blank rows and rules separate paragraphs. */
  paragraphs(from: number, to: number): string[] {
    const result: string[] = [];
    let current: ScreenRow[] = [];
    for (let index = from; index < to; index += 1) {
      const row = this.at(index);
      if (rowIsBlank(row) || this.isRuleRow(row)) {
        if (current.length > 0) result.push(this.joinRows(current));
        current = [];
      } else {
        current.push(row);
      }
    }
    if (current.length > 0) result.push(this.joinRows(current));
    return result;
  }

  isInactiveRow(row: ScreenRow): boolean {
    const visible = visibleRuns(row);
    return (
      visible.length > 0 &&
      visible.every((run) => sameColor(run.style.foreground, this.block.inactive))
    );
  }

  isBoldRow(row: ScreenRow): boolean {
    const visible = visibleRuns(row);
    return visible.length > 0 && visible.every((run) => run.style.isBold);
  }

  isRuleRow(row: ScreenRow): boolean {
    return ['─', '╌', '▔'].some((glyph) => isRule(row, glyph, this.fullWidth));
  }
}
