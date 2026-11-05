// What a visible-screen read shows of OpenCode's prompt: the route, the input box, and the footer's
// running signal (OpenCode 2.0.32; Swift OpenCodeScreenReader), anchored on text and layout rather
// than the theme's colors.
//
// The input box is a block of rows behind a left bar `┃`, closed by an edge row `╹▀▀▀`, with the
// footer the first row below it. Inside the bar: a padding row, the input rows, a padding row, then
// the agent row (`Build · <model>`, or `Shell` in shell mode). A blank row ends the box, which keeps
// out the transcript's barred blocks and the queued-prompt dock; popups sit directly on it with a bar
// at both edges. Permission and question prompts take the box's place and are the Blocked parser's:
// `detectInputBox` reads them first, and here they read as no box.

import { OpenCodeBlock, textFromColumn } from '../../blocked/opencode-block';
import {
  type AnsiScreen,
  normalizedSpaces,
  rowIndent,
  rowIsBlank,
  runEnd,
  type ScreenColor,
  type ScreenRow,
  sameColor,
  trimBlanks,
  trimmedText,
  visibleRuns,
} from '../../blocked/screen';
import type { InputBoxState } from '../send/input-box';

export type OpenCodeRoute =
  /** The home screen, where a message starts a new conversation. */
  | 'home'
  /** A conversation with its input box. */
  | 'session'
  /** The subagent panel, or a subagent's view under it, in place of the input box. */
  | 'subagentPanel'
  /** Anything else, such as a prompt in place of the input box. */
  | 'unknown';

export interface OpenCodeScreen {
  route: OpenCodeRoute;
  state: InputBoxState;
  /** The footer shows a turn running: its progress bar or `esc interrupt`. */
  isRunning: boolean;
  /** One Esc armed the interrupt: `esc again to interrupt`. */
  isArmed: boolean;
  /** The title of a picker or menu over the screen, or the first row of a `/` or `@` popup over the input box. */
  overlayTitle: string | null;
}

const HOME_REASON =
  'OpenCode is on its home screen, where a message starts a new conversation. Open this conversation in the terminal first.';
const SUBAGENT_PANEL_REASON =
  'OpenCode shows its subagent panel instead of the input box. Close it in the terminal first.';
const WORKING_REASON = "OpenCode is working. Send once it's idle, or steer from the terminal.";
/** The top row of the logo the home screen draws above its box. */
const LOGO_TOP_ROW = '█▀▀█ █▀▀█ █▀▀█ █▀▀▄';

const chars = (text: string) => [...text];

/** The text right of the bar. */
const content = (row: ScreenRow, column: number): string =>
  trimBlanks(normalizedSpaces(textFromColumn(row, column + 1)));

function isPopupRow(row: ScreenRow): boolean {
  const text = trimmedText(row);
  return chars(text).length > 1 && text.startsWith('┃') && text.endsWith('┃');
}

/** A row of the input box: the bar at the edge's column, without the second bar a popup row closes with. */
const isBoxRow = (row: ScreenRow, column: number): boolean =>
  rowIndent(row) === column && chars(textFromColumn(row, column))[0] === '┃' && !isPopupRow(row);

/** The `/` or `@` popup on the box: rows with a bar at both edges. Its first row, without the bars. */
function popupRow(top: number, column: number, rows: readonly ScreenRow[]): string | null {
  let first: ScreenRow | null = null;
  for (let index = top - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if (!row || rowIndent(row) !== column || !isPopupRow(row)) break;
    first = row;
  }
  return first ? trimBlanks(chars(trimmedText(first)).slice(1, -1).join('')) : null;
}

/**
 * A picker or menu, such as the session picker or the command list, drawn over the screen: its
 * title row ends in `esc`, the key that closes it, set apart by blanks. Rows behind a bar are the
 * transcript's or a panel's.
 */
function modalTitle(edge: number, rows: readonly ScreenRow[]): string | null {
  for (const row of rows.slice(0, edge)) {
    const text = trimmedText(row);
    if (text.startsWith('┃') || !text.endsWith('  esc')) continue;
    const title = trimBlanks(text.slice(0, -3));
    if (title !== '') return title;
  }
  return null;
}

/**
 * OpenCode shows a placeholder only on its home screen, `Ask anything… "…"` or
 * `Run a command… "…"` in shell mode, in its muted color: the color its footer starts with, the
 * directory's. A draft takes the text color, so one that happens to read the same stays a draft.
 */
function isPlaceholder(
  input: readonly ScreenRow[],
  column: number,
  muted: ScreenColor | null | undefined,
): boolean {
  const row = input.length === 1 ? input[0] : undefined;
  if (!row) return false;
  const text = content(row, column);
  if (!text.startsWith('Ask anything… "') && !text.startsWith('Run a command… "')) return false;
  // A row without color is one run, the bar included.
  const runs = visibleRuns(row).filter((run) => runEnd(run) > column + 1);
  return runs.length > 0 && runs.every((run) => sameColor(run.style.foreground, muted ?? null));
}

/**
 * `esc interrupt`, or the progress bar of four or more `■`/`⬝` cells that starts the footer while a
 * turn runs (`[⋯]` with animations off). At 62 columns the footer can cut the hint (`esc...rupt`)
 * and keeps the bar.
 */
function showsRunningTurn(footer: string): boolean {
  if (footer.includes('esc interrupt') || footer.startsWith('[⋯]')) return true;
  let bar = 0;
  for (const character of footer) {
    if (character !== '■' && character !== '⬝') break;
    bar += 1;
  }
  return bar >= 4;
}

/** The panel Down opens on an empty box, and that a subagent's view shows, in place of the box. */
function showsSubagentPanel(screen: AnsiScreen): boolean {
  const header = OpenCodeBlock.bottom(screen)?.sections[0]?.[0]?.text;
  if (header === undefined) return false;
  const words = header.split(/\s+/u).filter((word) => word !== '');
  return words[0] === 'Subagents' && words[1] === 'Shell' && words[2] === 'Terminals';
}

export function readOpenCodeScreen(screen: AnsiScreen): OpenCodeScreen {
  const rows = screen.rows;
  let edge = -1;
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if (row && trimmedText(row).startsWith('╹▀')) {
      edge = index;
      break;
    }
  }
  const edgeRow = rows[edge];
  const column = edgeRow ? rowIndent(edgeRow) : null;
  if (edgeRow === undefined || column === null) {
    if (showsSubagentPanel(screen)) {
      return {
        route: 'subagentPanel',
        state: { kind: 'noComposer', reason: SUBAGENT_PANEL_REASON },
        isRunning: false,
        isArmed: false,
        overlayTitle: null,
      };
    }
    return {
      route: 'unknown',
      state: { kind: 'unknown', reason: "OpenCode's input box is not on screen." },
      isRunning: false,
      isArmed: false,
      overlayTitle: null,
    };
  }

  const footer = rows.slice(edge + 1).find((row) => !rowIsBlank(row));
  const footerText = footer ? trimmedText(footer) : '';
  const isArmed = footerText.includes('esc again to interrupt');
  const isRunning = isArmed || showsRunningTurn(footerText);

  let top = edge;
  while (top > 0) {
    const above = rows[top - 1];
    if (!above || !isBoxRow(above, column)) break;
    top -= 1;
  }
  const hasLogo = rows.slice(0, top).some((row) => trimmedText(row).startsWith(LOGO_TOP_ROW));
  const overlayTitle = modalTitle(edge, rows) ?? popupRow(top, column, rows);
  const read: OpenCodeScreen = {
    route: hasLogo ? 'home' : 'unknown',
    state: { kind: 'unknown', reason: "OpenCode's input box is not recognized." },
    isRunning,
    isArmed,
    overlayTitle,
  };
  if (overlayTitle !== null) read.state = { kind: 'overlay', row: overlayTitle };

  // A padding row, the input rows, a padding row, the agent row.
  const box = rows.slice(top, edge);
  const first = box[0];
  const nextToLast = box[box.length - 2];
  const agentRow = box[box.length - 1];
  if (
    box.length < 4 ||
    !first ||
    !nextToLast ||
    !agentRow ||
    content(first, column) !== '' ||
    content(nextToLast, column) !== ''
  ) {
    return read;
  }
  const label = content(agentRow, column);
  if (label === '') return read;
  const input = box.slice(1, box.length - 2);
  const showsPlaceholder = isPlaceholder(
    input,
    column,
    footer ? visibleRuns(footer)[0]?.style.foreground : null,
  );
  read.route = hasLogo || showsPlaceholder ? 'home' : 'session';
  if (overlayTitle !== null) return read;

  const lines = showsPlaceholder
    ? []
    : input.map((row) => content(row, column)).filter((line) => line !== '');
  const draft = lines.join('\n');
  // Blank rows past the first are newlines typed into the box.
  const isEmpty = lines.length === 0 && (showsPlaceholder || input.length === 1);
  if (label === 'Shell' || footerText.endsWith('exit shell mode')) {
    read.state = { kind: 'shellMode', command: draft };
  } else if (read.route === 'home') {
    read.state = isEmpty
      ? { kind: 'noComposer', reason: HOME_REASON }
      : { kind: 'text', text: draft };
  } else if (!isEmpty) {
    read.state = { kind: 'text', text: draft };
  } else if (isRunning) {
    // Enter would steer the turn, and a prompt that appears before herdr's Enter would take it as its answer.
    read.state = { kind: 'disabled', reason: WORKING_REASON };
  } else {
    read.state = { kind: 'empty', placeholder: null };
  }
  return read;
}
