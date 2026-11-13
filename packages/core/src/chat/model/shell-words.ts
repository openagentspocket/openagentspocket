// A small shell scanner that splits a command line into simple commands' words, enough to tell
// whether `git checkout`/`reset`/... ran (Swift ClaudeToolSummary's ShellWords). It understands
// quotes, `$(…)`, backticks, here-documents, redirections and arithmetic; it never executes anything.

export const RESERVED_WORDS: ReadonlySet<string> = new Set([
  'if',
  'then',
  'else',
  'elif',
  'do',
  'while',
  'until',
  '!',
  '{',
  'time',
]);

export function isAssignment(word: string): boolean {
  const equals = word.indexOf('=');
  if (equals <= 0) return false;
  const first = word.charAt(0);
  if (!(first === '_' || /[A-Za-z]/.test(first))) return false;
  return /^[A-Za-z0-9_]*$/.test(word.slice(0, equals));
}

const NEWLINE = {
  test: (c: string) =>
    c === '\n' ||
    c === '\r' ||
    c === '\u000b' ||
    c === '\u000c' ||
    c === '\u0085' ||
    c === '\u2028' ||
    c === '\u2029',
};
const MAXIMUM_NESTING = 32;
const MAXIMUM_ARITHMETIC = 1000;

class Scanner {
  readonly commands: string[][] = [];
  private readonly chars: string[];
  private index = 0;
  private nesting = 0;
  private documents: { delimiter: string; stripsTabs: boolean }[] = [];

  constructor(line: string) {
    this.chars = Array.from(line);
  }

  private get canNest(): boolean {
    return this.nesting < MAXIMUM_NESTING;
  }

  private next(is: string, after = 0): boolean {
    return this.index + after < this.chars.length && this.chars[this.index + after] === is;
  }

  readCommands(close: string | null = null): void {
    this.nesting += 1;
    let words: string[] = [];
    let word = '';
    let inWord = false;
    let isTarget = false;
    let depth = 0;
    const endWord = () => {
      if (!inWord) return;
      if (isTarget) isTarget = false;
      else words.push(word);
      word = '';
      inWord = false;
    };
    const endCommand = () => {
      endWord();
      isTarget = false;
      if (words.length > 0) this.commands.push(words);
      words = [];
    };
    while (this.index < this.chars.length) {
      const char = this.chars[this.index] as string;
      this.index += 1;
      if (char === close && depth === 0) {
        endCommand();
        this.nesting -= 1;
        return;
      }
      if (char === '\\') {
        if (this.index >= this.chars.length) continue;
        const escaped = this.chars[this.index] as string;
        if (!NEWLINE.test(escaped)) {
          word += escaped;
          inWord = true;
        }
        this.index += 1;
      } else if (char === "'") {
        word += this.readSingleQuoted();
        inWord = true;
      } else if (char === '"') {
        word += this.readDoubleQuoted();
        inWord = true;
      } else if (char === '$' && this.next("'")) {
        this.index += 1;
        word += this.readAnsiQuoted();
        inWord = true;
      } else if (char === '$' && this.next('(')) {
        word += this.readSubstitution();
        inWord = true;
      } else if (char === '`' && this.canNest) {
        this.readCommands('`');
        word += '`…`';
        inWord = true;
      } else if (char === '(') {
        const end =
          !inWord && this.next('(') && words.every(leadsArithmetic)
            ? this.arithmeticEnd(this.index + 1)
            : null;
        if (end !== null) {
          this.index = end;
        } else {
          endCommand();
          depth += 1;
        }
      } else if (char === ')') {
        endCommand();
        depth = Math.max(depth - 1, 0);
      } else if (char === ' ' || char === '\t') {
        endWord();
      } else if (char === '#' && !inWord) {
        while (this.index < this.chars.length && !NEWLINE.test(this.chars[this.index] as string))
          this.index += 1;
      } else if (char === '<' && this.next('<') && this.next('<', 1)) {
        endWord();
        this.index += 2;
        isTarget = true;
      } else if (char === '<' && this.next('<')) {
        endWord();
        this.index += 1;
        this.readDocumentDelimiter();
      } else if (char === '<' || char === '>') {
        if (inWord && /^[0-9]+$/.test(word)) {
          word = '';
          inWord = false;
        } else {
          endWord();
        }
        if (this.next('>') || this.next('|') || this.next('&')) this.index += 1;
        isTarget = true;
      } else if (char === '&' && this.next('>')) {
        endWord();
        this.index += this.next('>', 1) ? 2 : 1;
        isTarget = true;
      } else if (NEWLINE.test(char)) {
        endCommand();
        this.skipDocuments();
      } else if (char === ';' || char === '&' || char === '|') {
        endCommand();
      } else {
        word += char;
        inWord = true;
      }
    }
    endCommand();
    this.nesting -= 1;
  }

  private readSingleQuoted(): string {
    let text = '';
    while (this.index < this.chars.length) {
      const char = this.chars[this.index] as string;
      this.index += 1;
      if (char === "'") return text;
      text += char;
    }
    return text;
  }

  private readAnsiQuoted(): string {
    let text = '';
    while (this.index < this.chars.length) {
      const char = this.chars[this.index] as string;
      this.index += 1;
      if (char === "'") return text;
      if (char === '\\' && this.index < this.chars.length) {
        text += this.chars[this.index] as string;
        this.index += 1;
      } else {
        text += char;
      }
    }
    return text;
  }

  private readDoubleQuoted(): string {
    let text = '';
    while (this.index < this.chars.length) {
      const char = this.chars[this.index] as string;
      this.index += 1;
      if (char === '"') return text;
      if (char === '\\' && this.index < this.chars.length) {
        const escaped = this.chars[this.index] as string;
        this.index += 1;
        if (NEWLINE.test(escaped)) continue;
        if (!'$`"\\'.includes(escaped)) text += '\\';
        text += escaped;
      } else if (char === '$' && this.next('(')) {
        text += this.readSubstitution();
      } else if (char === '`' && this.canNest) {
        this.readCommands('`');
        text += '`…`';
      } else {
        text += char;
      }
    }
    return text;
  }

  private readSubstitution(): string {
    if (this.next('(', 1)) {
      const end = this.arithmeticEnd(this.index + 2);
      if (end !== null) {
        this.index = end;
        return '$((…))';
      }
    }
    if (!this.canNest) return '$';
    this.index += 1;
    this.readCommands(')');
    return '$(…)';
  }

  private arithmeticEnd(start: number): number | null {
    let depth = 0;
    let position = start;
    const limit = Math.min(this.chars.length, start + MAXIMUM_ARITHMETIC);
    while (position < limit) {
      const char = this.chars[position];
      if (char === '(') {
        depth += 1;
      } else if (char === ')' && depth > 0) {
        depth -= 1;
      } else if (char === ')') {
        const closes = position + 1 < this.chars.length && this.chars[position + 1] === ')';
        return closes ? position + 2 : null;
      }
      position += 1;
    }
    return null;
  }

  private readDocumentDelimiter(): void {
    const stripsTabs = this.next('-');
    if (stripsTabs) this.index += 1;
    while (this.next(' ') || this.next('\t')) this.index += 1;
    let delimiter = '';
    while (this.index < this.chars.length) {
      const char = this.chars[this.index] as string;
      if (NEWLINE.test(char) || ' \t;&|()<>`'.includes(char)) break;
      if (!'\'"\\'.includes(char)) delimiter += char;
      this.index += 1;
    }
    if (delimiter !== '') this.documents.push({ delimiter, stripsTabs });
  }

  private skipDocuments(): void {
    for (const document of this.documents) {
      this.index = this.lineAfter(document.delimiter, document.stripsTabs, this.index);
    }
    this.documents = [];
  }

  private lineAfter(delimiter: string, stripsTabs: boolean, start: number): number {
    let lineStart = start;
    while (lineStart < this.chars.length) {
      let lineEnd = lineStart;
      while (lineEnd < this.chars.length && !NEWLINE.test(this.chars[lineEnd] as string))
        lineEnd += 1;
      let line = this.chars.slice(lineStart, lineEnd);
      if (stripsTabs) {
        let first = 0;
        while (first < line.length && line[first] === '\t') first += 1;
        line = line.slice(first);
      }
      const next = Math.min(lineEnd + 1, this.chars.length);
      if (line.join('') === delimiter) return next;
      lineStart = next;
    }
    return this.chars.length;
  }
}

function leadsArithmetic(word: string): boolean {
  return word === 'for' || RESERVED_WORDS.has(word);
}

export function simpleCommands(line: string): string[][] {
  const scanner = new Scanner(line);
  scanner.readCommands();
  return scanner.commands;
}
