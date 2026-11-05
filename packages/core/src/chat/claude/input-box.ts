// Claude Code's input box as Chat reads it before and after a send (Swift InputBoxStateDetector,
// Claude section).

import { locateClaudeInputBox, readFieldText } from '../../blocked/claude-models';
import { runsFrom } from '../../blocked/row-scanner';
import { type AnsiScreen, trimmedText } from '../../blocked/screen';
import { emptyBox, type InputBoxState } from '../send/input-box';

/**
 * While a queued message is selected for editing, Enter edits it instead of sending, so that hint
 * counts as an overlay.
 */
const QUEUE_EDIT_HINT = 'Press Enter to edit the selected message';

/** Suggestions and pickers Claude draws under the box: a pointer row, a numbered row, or a `/command` with its description. */
const OVERLAY_PATTERNS = [/^(❯|>)\s+\S/u, /^\d+\.\s/u, /^\/[\w:-]+\s{2,}\S/u];

/**
 * Dim text in Claude's box is a placeholder: a hint or, after a turn, a prompt suggestion of any
 * text, which typing replaces.
 */
export function readClaudeInputBox(screen: AnsiScreen): InputBoxState {
  const box = locateClaudeInputBox(screen);
  if (!box) return { kind: 'unknown', reason: "Claude's input box is not on screen." };
  const rows = screen.rows;
  const first = rows[box.inputRows.start];
  const field = readFieldText(first ? runsFrom(first, 2) : []);
  const moreLines = rows
    .slice(box.inputRows.start + 1, box.inputRows.end)
    .map(trimmedText)
    .filter((text) => text !== '');
  let firstLine = '';
  let placeholder: string | null = null;
  if (field.kind === 'typed') firstLine = field.text;
  else placeholder = field.text === '' ? null : field.text;
  const lines = [...(firstLine === '' ? [] : [firstLine]), ...moreLines];
  if (box.glyph === '!') return { kind: 'shellMode', command: lines.join('\n') };
  if (lines.length > 0) return { kind: 'text', text: lines.join('\n') };
  for (const row of rows.slice(box.bottomRule + 1)) {
    const text = trimmedText(row);
    if (text !== '' && OVERLAY_PATTERNS.some((pattern) => pattern.test(text))) {
      return { kind: 'overlay', row: text };
    }
  }
  if (placeholder === null) return emptyBox();
  return placeholder.startsWith(QUEUE_EDIT_HINT)
    ? { kind: 'overlay', row: placeholder }
    : emptyBox(placeholder);
}
