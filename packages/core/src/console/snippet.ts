/** Lines read from a Blocked Agent's pane to find what it is asking. */
export const SNIPPET_READ_LINES = 24;
const SNIPPET_MAX_LENGTH = 240;
const MARKERS = new Set([...'›❯>•']);
const KEY_HINTS = [
  'to select',
  'to navigate',
  'to cancel',
  'to confirm',
  'to cycle',
  'for shortcuts',
];

function graphemes(text: string): string[] {
  return [...text];
}

/** One line with box-drawing frames, leading prompt markers and edge blanks removed. */
function lineText(line: string): string | undefined {
  let text = graphemes(line)
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code < 0x2500 || code > 0x257f;
    })
    .join('')
    .replace(/^[ \t]+|[ \t]+$/g, '');
  for (;;) {
    const first = graphemes(text)[0];
    if (first === undefined || !MARKERS.has(first)) break;
    text = text.slice(first.length).replace(/^[ \t]+|[ \t]+$/g, '');
  }
  return graphemes(text).length > 1 ? text : undefined;
}

function isKeyHint(line: string): boolean {
  const lowered = line.toLowerCase();
  return KEY_HINTS.some((hint) => lowered.includes(hint));
}

function bounded(text: string): string {
  const chars = graphemes(text);
  return chars.length > SNIPPET_MAX_LENGTH
    ? `${chars.slice(0, SNIPPET_MAX_LENGTH - 1).join('')}…`
    : text;
}

/**
 * What a Blocked Agent is asking, from its pane text: the paragraph above the numbered options
 * when there are any, else the last line that asks a question, else the last line with text.
 * Frames and key hints never count; undefined when nothing is left.
 */
export function snippetFromPaneText(text: string): string | undefined {
  // undefined marks a line with no text: it separates paragraphs.
  const lines = text.split('\n').map((raw) => {
    const line = lineText(raw);
    return line !== undefined && !isKeyHint(line) ? line : undefined;
  });
  let firstOption = -1;
  lines.forEach((line, index) => {
    if (line?.startsWith('1. ') || line?.startsWith('1) ')) firstOption = index;
  });
  if (firstOption >= 0) {
    const paragraph: string[] = [];
    let index = firstOption - 1;
    while (index >= 0 && lines[index] === undefined) index -= 1;
    for (let line = lines[index]; index >= 0 && line !== undefined; line = lines[index]) {
      paragraph.unshift(line);
      index -= 1;
    }
    if (paragraph.length > 0) return bounded(paragraph.join(' '));
  }
  const content = lines.filter((line): line is string => line !== undefined);
  const chosen = [...content].reverse().find((line) => line.includes('?')) ?? content.at(-1);
  return chosen === undefined ? undefined : bounded(chosen);
}
