import { describe, expect, it } from 'vitest';
import '../chat/programs';
import { decodeAnsiScreen } from './ansi-decoder';
import { parseClaudeDialog } from './claude-parser';

const ESC = String.fromCharCode(27);
const DIM = `${ESC}[0m${ESC}[38;2;153;153;153m`;
const RESET = `${ESC}[0m`;
const RULE = `${DIM}${'─'.repeat(80)}`;

/** Claude Code 2.x's question page, as read from a live pane: the question sits behind a dim `│` bar. */
function questionScreen(question: readonly string[]): string {
  return [
    RULE,
    `${ESC}[0m${ESC}[38;2;0;0;0m${ESC}[48;2;177;185;249m ☐ Sizes ${RESET}`,
    '',
    ...question.map((line) => `${ESC}[0m${ESC}[2m│${RESET} ${ESC}[0m${ESC}[1m${line}${RESET}`),
    '',
    `${ESC}[0m${ESC}[38;2;177;185;249m❯${RESET} ${DIM}1.${RESET} ${ESC}[0m${ESC}[38;2;177;185;249mAll good${RESET}`,
    `     ${DIM}Sizes look right.${RESET}`,
    `  ${DIM}2.${RESET} Adjust`,
    `     ${DIM}Something is off.${RESET}`,
    `  ${DIM}3. Type something.`,
    RULE,
    '  4. Chat about this',
    '',
    `${DIM}Enter to select · ↑/↓ to navigate · Esc to cancel${RESET}`,
    RULE,
  ].join('\n');
}

describe('Claude question', () => {
  it('reads the question without the bar Claude Code draws before it', () => {
    const result = parseClaudeDialog(decodeAnsiScreen(questionScreen(['How do the sizes look?'])));
    expect(result.kind).toBe('dialog');
    if (result.kind !== 'dialog') return;
    expect(result.dialog.subject.question).toBe('How do the sizes look?');
    expect(result.dialog.title).toBe('How do the sizes look?');
  });

  it('joins a wrapped question without its bars', () => {
    const screen = questionScreen(['How do the sizes of the buttons', 'look now?']);
    const result = parseClaudeDialog(decodeAnsiScreen(screen));
    if (result.kind !== 'dialog') throw new Error(result.kind);
    expect(result.dialog.subject.question).toBe('How do the sizes of the buttons look now?');
  });
});
