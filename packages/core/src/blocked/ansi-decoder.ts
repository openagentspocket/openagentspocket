import { textWidth } from './cell-width';
import {
  type AnsiScreen,
  makeRow,
  makeScreen,
  PLAIN_STYLE,
  type ScreenColor,
  type ScreenRow,
  type ScreenRun,
  type ScreenStyle,
  sameStyle,
} from './screen';

const clampByte = (value: number): number => Math.max(0, Math.min(255, value));

const parseInteger = (field: string): number | null =>
  /^[+-]?\d+$/.test(field) ? Number(field) : null;

/** `5;n` or `2;r;g;b` after a 38 or 48: the color, if the values form one, and values consumed. */
function extendedColor(values: readonly (number | null)[]): {
  color: ScreenColor | null;
  used: number;
} {
  const kind = values[0];
  const none = { color: null, used: values.length };
  if (kind === 5) {
    const index = values[1];
    if (values.length < 2 || index == null) return none;
    return { color: { kind: 'indexed', index: clampByte(index) }, used: 2 };
  }
  if (kind === 2) {
    const r = values[1];
    const g = values[2];
    const b = values[3];
    if (values.length < 4 || r == null || g == null || b == null) return none;
    return { color: { kind: 'rgb', r: clampByte(r), g: clampByte(g), b: clampByte(b) }, used: 4 };
  }
  return none;
}

const STRING_SEQUENCE_INTRODUCERS = new Set([']', 'P', '_', '^', 'X']);

class Builder {
  style: ScreenStyle = PLAIN_STYLE;
  private rows: ScreenRow[] = [];
  private runs: ScreenRun[] = [];
  private pending = '';
  private pendingStyle: ScreenStyle = PLAIN_STYLE;
  private column = 0;

  append(character: string): void {
    if (!sameStyle(this.pendingStyle, this.style)) {
      this.flush();
      this.pendingStyle = this.style;
    }
    this.pending += character;
  }

  appendTab(): void {
    this.flush();
    const stop = (Math.floor(this.column / 8) + 1) * 8;
    for (let at = this.column; at < stop; at += 1) this.append(' ');
  }

  endRow(): void {
    this.flush();
    this.rows.push(makeRow(this.rows.length, this.runs));
    this.runs = [];
    this.column = 0;
  }

  finish(endsWithNewline: boolean): ScreenRow[] {
    this.flush();
    // A read that ends with a line break has no row after it.
    if (!(endsWithNewline && this.runs.length === 0)) this.endRow();
    return this.rows;
  }

  /** Skips one escape sequence and applies it when it is SGR. Returns the index past it. */
  consumeEscape(scalars: readonly string[], start: number): number {
    let index = start + 1;
    const introducer = scalars[index];
    if (introducer === undefined) return index;
    const codeAt = (at: number) => scalars[at]?.codePointAt(0) ?? 0;
    if (introducer === '[') {
      index += 1;
      let parameters = '';
      while (index < scalars.length) {
        const value = codeAt(index);
        if (value >= 0x40 && value <= 0x7e) {
          if (scalars[index] === 'm') this.applySgr(parameters);
          return index + 1;
        }
        if (value >= 0x30 && value <= 0x3f) parameters += scalars[index];
        else if (!(value >= 0x20 && value <= 0x2f)) return index; // cut off: read as text
        index += 1;
      }
      return index;
    }
    if (STRING_SEQUENCE_INTRODUCERS.has(introducer)) {
      // OSC and the other string sequences end with BEL or ST.
      index += 1;
      while (index < scalars.length) {
        if (codeAt(index) === 0x07) return index + 1;
        if (codeAt(index) === 0x1b) {
          return index + 1 < scalars.length && scalars[index + 1] === '\\' ? index + 2 : index + 1;
        }
        index += 1;
      }
      return index;
    }
    // Two- and three-byte sequences such as a charset selection.
    while (index < scalars.length && codeAt(index) >= 0x20 && codeAt(index) <= 0x2f) index += 1;
    return Math.min(index + 1, scalars.length);
  }

  private flush(): void {
    if (this.pending === '') return;
    const width = textWidth(this.pending);
    this.runs.push({ text: this.pending, style: this.pendingStyle, column: this.column, width });
    this.column += width;
    this.pending = '';
  }

  private set(patch: Partial<ScreenStyle>): void {
    this.style = { ...this.style, ...patch };
  }

  private applySgr(parameters: string): void {
    const fields = parameters === '' ? [''] : parameters.split(';');
    let position = 0;
    while (position < fields.length) {
      const field = fields[position] ?? '';
      if (field.includes(':')) {
        this.applyColonForm(field);
        position += 1;
        continue;
      }
      const code = parseInteger(field) ?? 0;
      if (code === 0) this.style = PLAIN_STYLE;
      else if (code === 1) this.set({ isBold: true });
      else if (code === 2) this.set({ isDim: true });
      else if (code === 3) this.set({ isItalic: true });
      else if (code === 7) this.set({ isReverse: true });
      else if (code === 22) this.set({ isBold: false, isDim: false });
      else if (code === 23) this.set({ isItalic: false });
      else if (code === 27) this.set({ isReverse: false });
      else if (code >= 30 && code <= 37) {
        this.set({ foreground: { kind: 'indexed', index: code - 30 } });
      } else if (code === 39) this.set({ foreground: null });
      else if (code >= 40 && code <= 47) {
        this.set({ background: { kind: 'indexed', index: code - 40 } });
      } else if (code === 49) this.set({ background: null });
      else if (code >= 90 && code <= 97) {
        this.set({ foreground: { kind: 'indexed', index: code - 90 + 8 } });
      } else if (code >= 100 && code <= 107) {
        this.set({ background: { kind: 'indexed', index: code - 100 + 8 } });
      } else if (code === 38 || code === 48 || code === 58) {
        // 58 is the underline color: its values are skipped.
        const { color, used } = extendedColor(fields.slice(position + 1).map(parseInteger));
        if (code === 38) this.set({ foreground: color });
        if (code === 48) this.set({ background: color });
        position += used;
      }
      position += 1;
    }
  }

  /** `38:2::r:g:b`, `38:2:r:g:b` and `38:5:n`, the ITU T.416 spelling. */
  private applyColonForm(field: string): void {
    const [head, ...rest] = field.split(':');
    const code = parseInteger(head ?? '');
    if (code !== 38 && code !== 48) return;
    const values = rest.map(parseInteger);
    // The optional color-space id sits between the 2 and red.
    if (values[0] === 2 && values.length === 5) values.splice(1, 1);
    const { color } = extendedColor(values);
    this.set(code === 38 ? { foreground: color } : { background: color });
  }
}

/**
 * Turns the text of an ANSI screen read into rows of styled runs (Swift's ANSIScreenDecoder).
 * herdr renders each row on its own, separated by CRLF; only SGR sequences occur, and any other
 * escape sequence is skipped instead of trusting that shape.
 */
export function decodeAnsiScreen(ansi: string): AnsiScreen {
  const builder = new Builder();
  const scalars = [...ansi];
  let index = 0;
  while (index < scalars.length) {
    const scalar = scalars[index] ?? '';
    const value = scalar.codePointAt(0) ?? 0;
    if (value === 0x1b) {
      index = builder.consumeEscape(scalars, index);
      continue;
    }
    if (value === 0x0a) builder.endRow();
    else if (value === 0x09) builder.appendTab();
    else if (value >= 0x20 && value !== 0x7f && !(value >= 0x80 && value < 0xa0)) {
      builder.append(scalar);
    }
    // Other controls are dropped; a carriage return alone would move the cursor, which a screen
    // read never asks for.
    index += 1;
  }
  return makeScreen(builder.finish(scalars[scalars.length - 1] === '\n'));
}
