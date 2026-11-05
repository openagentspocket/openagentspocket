// The structure of a Grok Build screen in its full-screen view, 1.0.62 (Swift GrokScreen): the
// composer box, the footer's hints, the turn status row and dock above the composer, and the
// overlays and views that take the composer's place. It reads structure only: Grok's colors are
// 24-bit and follow its theme, so the one style it reads is the italic attribute of ghost text.
// Every reader of a Grok screen (input box, Stop guard, session check) goes through it.

import { type AnsiScreen, rowIsBlank, type ScreenRow, trimmedText } from '../../blocked/screen';
import {
  INTERRUPT_HINT,
  isSendableWaitLabel,
  readCard,
  readComposer,
  readOverlay,
  readPromptHasFocus,
  showsMinimalPrompt,
  showsWelcome,
  statusArea,
} from './screen-regions';
import { boxedRows, readSessionLine, readUserRows } from './screen-scrollback';

export { composerIsEditingQueued, composerIsMultiline } from './screen-regions';

export type GrokComposerMode = 'prompt' | 'bash' | 'remember';

/** The input box: a `╭─╮` top border, `│ ❯ text │` rows and a `╰─╯` bottom border carrying the model. */
export interface GrokComposer {
  mode: GrokComposerMode;
  /** The typed text, rows trimmed and joined by newlines. Grok never draws typed text italic. */
  draft: string;
  /** The italic text at the cursor (a suggestion, or a shell completion). Enter never sends it. */
  ghost: string;
  /** The text set into the top border, such as `Stashed` or a `/rename` title. */
  topBorderLabel: string | null;
  /** The text set into the bottom border: the model, `editing queued #N`, `Run shell command`, `multiline`. */
  bottomBorder: string;
  topRow: number;
  bottomRow: number;
}

/** The turn status row above the composer: a braille spinner, what the turn does, then its timers. */
export interface GrokStatusRow {
  row: number;
  /** Such as `Waiting for subagent…`; a label that does not fit is cut to a prefix and `…`. */
  label: string;
  /** The phase and turn timers, tokens, buttons, and `· N queued, Enter to send now` when shown. */
  trailer: string;
}

export interface GrokUserRow {
  /** The row's text after `❯ `, without the scrollbar and the time Grok sets at the right. */
  text: string;
}

export interface GrokSessionLine {
  /** The session the screen shows: the line's first id, lowercased. */
  sessionID: string;
}

export interface GrokScreen {
  composer: GrokComposer | null;
  /** The shortcuts row: the last nonblank row below the composer, or on the screen when no composer shows. */
  footer: string | null;
  /** The prompt has focus (see `promptHasFocus`). */
  promptHasFocus: boolean;
  /** The footer while Grok waits for a second press, such as `Ctrl+c:press again to quit`. */
  pendingDoublePress: string | null;
  statusRow: GrokStatusRow | null;
  /** The dock's section headers between the status row and the composer, top to bottom. */
  dockSections: string[];
  /** Text after a `○ ◎ ◉` icon in the status row's place: background work while idle, or a parked wait. */
  cue: string | null;
  /** The row that shows a popup, picker or panel over the composer. */
  overlay: string | null;
  /** The rows of the card in the composer's place (a permission, a question), when one offers options. */
  card: { lowerBound: number; upperBound: number } | null;
  isDashboard: boolean;
  /** The dashboard's view of one agent: a message or Ctrl+C reaches that agent, which may not be this conversation. */
  isDashboardOverlay: boolean;
  isWelcome: boolean;
  /** Minimal mode: a flush-left `❯` prompt without a box. */
  isMinimal: boolean;
  userRows: GrokUserRow[];
  sessionLine: GrokSessionLine | null;
  /** The turn waits on something a message would end (a subagent, task output, a sleep). */
  sendableWait: boolean;
  isParked: boolean;
  isCancelling: boolean;
}

export function readGrokScreen(screen: AnsiScreen): GrokScreen {
  const { rows } = screen;
  let composer = readComposer(rows);
  const below = (composer?.bottomRow ?? -1) + 1;
  let footer: string | null = null;
  for (let index = rows.length - 1; index >= below; index -= 1) {
    const row = rows[index] as ScreenRow;
    if (!rowIsBlank(row)) {
      footer = trimmedText(row);
      break;
    }
  }
  const promptHasFocus = readPromptHasFocus(footer, composer);
  // Without focus, Grok draws its placeholder in an empty box.
  if (!promptHasFocus && composer?.draft === 'Build anything')
    composer = { ...composer, draft: '' };
  const area = composer === null ? null : statusArea(rows, composer.topRow);
  const status = area?.status ?? null;
  const dockSections = area?.dock ?? [];
  const cue = area?.cue ?? null;
  const isParked =
    cue !== null &&
    (cue.startsWith('waiting') ||
      cue
        .split(' · ')
        .slice(1)
        .some((part) => part !== '' && (INTERRUPT_HINT.startsWith(part) || /^\d+ q/u.test(part))));
  const subagentsDocked = dockSections.some((section) => section.startsWith('Subagents'));
  const sendableWait =
    isParked ||
    (status !== null &&
      (status.trailer.includes('Enter to send now') ||
        isSendableWaitLabel(status.label, subagentsDocked)));
  const boxed = boxedRows(rows);
  return {
    composer,
    footer,
    promptHasFocus,
    pendingDoublePress: footer?.includes('press again to') ? footer : null,
    statusRow: status,
    dockSections,
    cue,
    overlay: readOverlay(rows, composer),
    card: readCard(rows),
    isDashboard:
      composer?.draft === 'Dispatch a new agent' ||
      footer?.startsWith('Enter:create') === true ||
      rows.slice(0, 6).some((row) => trimmedText(row).startsWith('+ New Agent')),
    isDashboardOverlay:
      footer?.startsWith('Ctrl+\\:dashboard') === true ||
      rows.slice(0, 2).some((row) => /‹ \d+\/\d+ ›/u.test(row.text)),
    isWelcome: showsWelcome(rows),
    isMinimal: composer === null && showsMinimalPrompt(rows),
    userRows: readUserRows(rows, boxed),
    sessionLine: readSessionLine(rows, boxed),
    sendableWait,
    isParked,
    isCancelling: status?.label.startsWith('Cancelling') === true,
  };
}
