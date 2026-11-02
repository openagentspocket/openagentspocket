import {
  CODEX_POINTER,
  isPointed,
  joinWrapped,
  type NumberedOptionRow,
  numberedOption,
  runsFrom,
} from './row-scanner';
import {
  type AnsiScreen,
  isBlankRun,
  normalizedSpaces,
  rowIndent,
  rowIsBlank,
  type ScreenRow,
  type ScreenRun,
  trimBlanks,
  trimmedText,
  visibleRuns,
} from './screen';

const HEADER_LABELS = [
  'Environment',
  'Reason',
  'Description',
  'Destination',
  'Permission rule',
  'Thread',
  'Input',
  'Server',
];

export interface CodexOptionDraft {
  number: number;
  labelColumn: number;
  isFocused: boolean;
  label: string;
  detail: string | null;
  lastRow: ScreenRow;
  lastDetailRow: ScreenRow;
}

export interface BlockRange {
  readonly first: number;
  readonly last: number;
}

const EMPTY_ROW: ScreenRow = { index: -1, runs: [], text: '', width: 0 };

const textOf = (runs: readonly ScreenRun[]): string =>
  trimBlanks(normalizedSpaces(runs.map((run) => run.text).join('')));

/** Row-level reading of Codex's views: blocks, option columns, header entries. */
export class CodexRows {
  readonly rows: readonly ScreenRow[];
  readonly columns: number;

  constructor(screen: AnsiScreen) {
    this.rows = screen.rows;
    this.columns = screen.columns;
  }

  at(index: number): ScreenRow {
    return this.rows[index] ?? EMPTY_ROW;
  }

  /** The first row of the block of non-blank rows ending at `row`. */
  blockStart(row: number): number {
    let start = row;
    while (start > 0 && !rowIsBlank(this.at(start - 1))) start -= 1;
    return start;
  }

  /** The block of non-blank rows above `row`, past any blank rows. */
  blockAbove(row: number): BlockRange | null {
    let end = row - 1;
    while (end >= 0 && rowIsBlank(this.at(end))) end -= 1;
    return end < 0 ? null : { first: this.blockStart(end), last: end };
  }

  joinRows(group: readonly ScreenRow[]): string {
    let text = '';
    let previous: ScreenRow | undefined;
    for (const row of group) {
      if (rowIsBlank(row)) continue;
      text = previous
        ? joinWrapped(text, trimmedText(row), 'codex', previous, this.columns, rowIndent(row) ?? 0)
        : trimmedText(row);
      previous = row;
    }
    return text;
  }

  slice(first: number, last: number): ScreenRow[] {
    return this.rows.slice(first, last + 1);
  }

  /**
   * The bold title above the header rows of an approval. Header rows sit at column 2 like the
   * title; reaching a column-0 row first means the history, so the title is off screen.
   */
  titleAbove(row: number): { text: string; first: number; end: number } | null {
    let cursor = row;
    for (;;) {
      const block = this.blockAbove(cursor);
      if (!block || cursor - block.first > 24) return null;
      const blockRows = this.slice(block.first, block.last);
      if (!blockRows.every((candidate) => (rowIndent(candidate) ?? 0) > 0)) return null;
      if (blockRows.every((candidate) => visibleRuns(candidate).every((run) => run.style.isBold))) {
        return { text: this.joinRows(blockRows), first: block.first, end: block.last + 1 };
      }
      cursor = block.first;
    }
  }

  /** The `Question i/n` row above the footer. */
  questionHeaderRow(footer: number): number | null {
    for (let index = footer - 1; index >= Math.max(0, footer - 30); index -= 1) {
      const row = this.at(index);
      if (
        /^Question \d+\/\d+/.test(trimmedText(row)) &&
        visibleRuns(row)[0]?.style.isDim === true
      ) {
        return index;
      }
    }
    return null;
  }

  /**
   * Reads the numbered options in a range, wrapped rows joined. Question rows have a second
   * column: the description, dim beside an unselected label and plain reverse beside the selected
   * one. Null when the rows do not form options 1…N.
   */
  readOptions(first: number, last: number, isQuestion: boolean): CodexOptionDraft[] | null {
    const drafts: CodexOptionDraft[] = [];
    for (let index = first; index <= last; index += 1) {
      const row = this.at(index);
      const numbered = numberedOption(row, CODEX_POINTER);
      if (numbered) {
        if (numbered.number !== drafts.length + 1) return null;
        const runs = runsFrom(row, numbered.labelColumn);
        const { label, detail } = isQuestion
          ? this.splitColumns(runs, isPointed(numbered))
          : { label: textOf(runs), detail: null };
        drafts.push({
          number: numbered.number,
          labelColumn: numbered.labelColumn,
          isFocused: isPointed(numbered),
          label,
          detail,
          lastRow: row,
          lastDetailRow: row,
        });
        continue;
      }
      // Verbatim from Swift: the last draft is taken off while the row is tested as a wrap.
      const draft = drafts.pop();
      const indent = rowIndent(row);
      if (!draft || indent === null || indent < draft.labelColumn) return null;
      const runs = runsFrom(row, draft.labelColumn);
      // A narrow pane wraps either column; a wrapped row keeps the first row's styles.
      const { label, detail } = isQuestion
        ? this.splitColumns(runs, draft.isFocused)
        : { label: textOf(runs), detail: null };
      if (detail !== null) {
        draft.detail =
          draft.detail === null
            ? detail
            : joinWrapped(
                draft.detail,
                detail,
                'codex',
                draft.lastDetailRow,
                this.columns,
                draft.labelColumn,
              );
        draft.lastDetailRow = row;
      }
      if (label !== '') {
        draft.label = joinWrapped(
          draft.label,
          label,
          'codex',
          draft.lastRow,
          this.columns,
          draft.labelColumn,
        );
        draft.lastRow = row;
      }
      drafts.push(draft);
    }
    return drafts.length === 0 ? null : drafts;
  }

  private splitColumns(
    runs: readonly ScreenRun[],
    isSelected: boolean,
  ): { label: string; detail: string | null } {
    let label = '';
    let detail = '';
    let inDetail = false;
    for (const run of runs) {
      if (!inDetail && !isBlankRun(run)) {
        inDetail = isSelected ? !run.style.isBold : run.style.isDim;
      }
      if (inDetail) detail += run.text;
      else label += run.text;
    }
    const trimmedDetail = trimBlanks(normalizedSpaces(detail));
    return {
      label: trimBlanks(normalizedSpaces(label)),
      detail: trimmedDetail === '' ? null : trimmedDetail,
    };
  }

  /** `Environment: local`, `Reason: …`, `$ touch x1.txt`: wrapped rows joined to their entry. */
  headerEntries(from: number, to: number): string[] {
    const entries: { text: string; row: ScreenRow }[] = [];
    for (let index = from; index < to; index += 1) {
      const row = this.at(index);
      if (rowIsBlank(row)) continue;
      const text = normalizedSpaces(trimmedText(row));
      const startsEntry =
        text.startsWith('$ ') || HEADER_LABELS.some((label) => text.startsWith(`${label}:`));
      const last = entries[entries.length - 1];
      if (startsEntry || !last) {
        entries.push({ text, row });
      } else {
        last.text = joinWrapped(
          last.text,
          text,
          'codex',
          last.row,
          this.columns,
          rowIndent(row) ?? 0,
        );
        last.row = row;
      }
    }
    return entries.map((entry) => entry.text);
  }

  /**
   * The numbered rows of the options block: the last block when the list has no footer, else the
   * block above the footer. A two-column list draws a description beside each label, and a narrow
   * pane wraps both columns, so a label keeps only its text before the description's gap.
   */
  numberedOptions(footer: BlockRange, start: number): Map<number, string> {
    const above = this.blockAbove(footer.first);
    for (const block of above ? [footer, above] : [footer]) {
      const numbered = new Map<number, string>();
      let current: NumberedOptionRow | null = null;
      for (let index = block.first; index <= block.last; index += 1) {
        if (index < start) continue;
        const row = this.at(index);
        const option = numberedOption(row, CODEX_POINTER);
        if (option) {
          numbered.set(option.number, this.labelText(runsFrom(row, option.labelColumn)));
          current = option;
        } else if (current && rowIndent(row) === current.labelColumn) {
          const part = this.labelText(runsFrom(row, current.labelColumn));
          if (part === '') continue;
          const head = numbered.get(current.number) ?? '';
          numbered.set(current.number, head === '' ? part : `${head} ${part}`);
        }
      }
      if (numbered.size > 0) return numbered;
    }
    return new Map();
  }

  /** The row's text before a two-column list's description. */
  private labelText(runs: readonly ScreenRun[]): string {
    const isBoldRow = runs.find((run) => !isBlankRun(run))?.style.isBold ?? false;
    let label = '';
    for (const run of runs) {
      const isDescription = isBoldRow ? !run.style.isBold : run.style.isDim;
      if (
        isDescription &&
        !isBlankRun(run) &&
        label !== '' &&
        normalizedSpaces(label).endsWith('  ')
      ) {
        break;
      }
      label += run.text;
    }
    const text = trimBlanks(normalizedSpaces(label));
    const gap = text.indexOf('   ');
    return gap < 0 ? text : trimBlanks(text.slice(0, gap));
  }
}
