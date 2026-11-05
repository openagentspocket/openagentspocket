import type { ChatProgram } from '../chat/model/types';
import type { Text } from '../errors/text';
import type { DialogFingerprint } from './fingerprint';
import type { ScreenRow } from './screen';

/**
 * Which prompt a parsed dialog is. The kind fixes the anchors the parser matched and the actions
 * a card may plan; a prompt the parsers do not know never gets a kind and falls back to the
 * generic card. Pi/OMP/Grok/OpenCode kinds are listed for P2.10, which adds their parsers.
 */
export type BlockedDialogKind =
  | 'claudeBash'
  | 'claudeFileEdit'
  | 'claudeFileCreate'
  | 'claudeFileRead'
  | 'claudeFetch'
  | 'claudePlan'
  | 'claudeQuestion'
  | 'claudeQuestionReview'
  | 'claudeWorkspaceTrust'
  | 'codexExec'
  | 'codexPatch'
  | 'codexNetwork'
  | 'codexQuestion'
  | 'codexAsyncCollapsed'
  | 'codexAsyncQuestion'
  | 'ompApproval'
  | 'ompQuestion'
  | 'ompQuestionReview'
  | 'grokPermission'
  | 'grokQuestion'
  | 'grokCancelTurn'
  | 'grokFork'
  | 'openCodePermission'
  | 'openCodeQuestion';

/** A kind starts with its program's name; a kind of a new program fails here, not as another's. */
const KIND_PREFIXES = [
  ['claude', 'claude'],
  ['codex', 'codex'],
  ['omp', 'omp'],
  ['grok', 'grok'],
  ['openCode', 'opencode'],
] as const satisfies readonly (readonly [string, ChatProgram])[];

export function programOfKind(kind: BlockedDialogKind): ChatProgram {
  const match = KIND_PREFIXES.find(([prefix]) => kind.startsWith(prefix));
  if (!match) throw new Error(`No program for the dialog kind ${kind}`);
  return match[1];
}

/** What choosing an option does, which sets its button style. */
export type DialogOptionRole =
  | 'approve'
  | 'approvePersistent'
  | 'approveModeSwitch'
  | 'decline'
  | 'answer'
  | 'otherText'
  | 'chat'
  | 'next'
  | 'submit'
  | 'cancel'
  | 'trust'
  | 'exitProgram';

/** An option row that is a text field: empty (its hint) or holding text. */
export type InputRowState =
  | { readonly kind: 'placeholder'; readonly text: string }
  | { readonly kind: 'text'; readonly text: string };

/** One choice the dialog offers, as the screen shows it. */
export interface DialogOption {
  /** The option's 1-based position in the dialog's options, unnumbered rows included. */
  readonly ordinal: number;
  /** The digit the program draws, null for an unnumbered row. */
  readonly number: number | null;
  readonly label: string;
  readonly detail: string | null;
  /** The key the label names in parentheses, without them: `y`, `esc`. */
  readonly shortcut: string | null;
  readonly role: DialogOptionRole;
  readonly isFocused: boolean;
  /** For a multi-select option, whether it is checked; null otherwise. */
  readonly isChecked: boolean | null;
  readonly input: InputRowState | null;
}

export function makeOption(
  fields: Pick<DialogOption, 'ordinal' | 'number' | 'label' | 'role'> & Partial<DialogOption>,
): DialogOption {
  return {
    detail: null,
    shortcut: null,
    isFocused: false,
    isChecked: null,
    input: null,
    ...fields,
  };
}

/** The parts of a dialog that move while the user acts on it, checked step by step. */
export interface DialogFocusState {
  readonly focusedOrdinal: number | null;
  /** Ordinals of checked multi-select options, ascending. */
  readonly checked: readonly number[];
  /** The text in the focused input row; null while it shows its placeholder. */
  readonly inputText: string | null;
  /** Codex: the notes typed for the highlighted answer; null while the field is closed. */
  readonly notesText: string | null;
  /** Claude: the option whose row Tab turned into a note field. */
  readonly feedbackOrdinal: number | null;
  /** Oh My Pi: the prompt below the question holds a draft. */
  readonly composerDraftGuard: boolean;
  /** Grok Build: the footer shows none of the card's hints. */
  readonly keysMissOptions: boolean;
}

export function makeFocus(fields: Partial<DialogFocusState> = {}): DialogFocusState {
  return {
    focusedOrdinal: null,
    checked: [],
    inputText: null,
    notesText: null,
    feedbackOrdinal: null,
    composerDraftGuard: false,
    keysMissOptions: false,
    ...fields,
  };
}

export interface ReviewAnswer {
  question: string;
  answer: string;
}

/** What a dialog asks about, as far as the screen shows it (the fields a transcript matcher compares). */
export interface DialogSubject {
  toolName: string | null;
  command: string | null;
  commandDescription: string | null;
  filePath: string | null;
  destinations: string[];
  url: string | null;
  host: string | null;
  prompt: string | null;
  reason: string | null;
  environment: string | null;
  question: string | null;
  questionHeaders: string[];
  reviewAnswers: ReviewAnswer[];
  planFilePath: string | null;
  workspacePath: string | null;
  notes: string[];
}

export function makeSubject(): DialogSubject {
  return {
    toolName: null,
    command: null,
    commandDescription: null,
    filePath: null,
    destinations: [],
    url: null,
    host: null,
    prompt: null,
    reason: null,
    environment: null,
    question: null,
    questionHeaders: [],
    reviewAnswers: [],
    planFilePath: null,
    workspacePath: null,
    notes: [],
  };
}

/** A dialog the parsers recognized, ready for a native card. */
export interface BlockedDialog {
  readonly kind: BlockedDialogKind;
  readonly program: ChatProgram;
  readonly title: string;
  readonly sourceSuffix: string | null;
  readonly positionLabel: string | null;
  readonly body: readonly string[];
  readonly progress: string | null;
  readonly options: readonly DialogOption[];
  /** The zero-based screen rows the dialog covers, half open. */
  readonly rows: { readonly lowerBound: number; readonly upperBound: number };
  readonly fingerprint: DialogFingerprint;
  readonly focus: DialogFocusState;
  readonly subject: DialogSubject;
  /** Agentico's own line under the options, about a choice the card leaves to the terminal. */
  readonly note: string | null;
}

/** The option at a 1-based ordinal. */
export const optionAt = (dialog: BlockedDialog, ordinal: number): DialogOption | undefined =>
  dialog.options[ordinal - 1];

/** A screen with something dialog-like the parsers could not name or trust. */
export interface GenericDialogExcerpt {
  readonly rows: readonly ScreenRow[];
  /** Numbered options, number to label. */
  readonly numbered: ReadonlyMap<number, string>;
  /** Why the screen did not parse as a known dialog (a Text: see errors/text). */
  readonly reason: Text;
  readonly fingerprint: DialogFingerprint;
  readonly displayLines: readonly string[] | null;
}

export type DialogParseResult =
  | { readonly kind: 'dialog'; readonly dialog: BlockedDialog }
  | { readonly kind: 'unrecognized'; readonly excerpt: GenericDialogExcerpt }
  | { readonly kind: 'none' };

export const NO_DIALOG: DialogParseResult = { kind: 'none' };

/** The fingerprint of whatever the screen shows, null when nothing looks like a dialog. */
export function resultFingerprint(result: DialogParseResult): DialogFingerprint | null {
  if (result.kind === 'dialog') return result.dialog.fingerprint;
  if (result.kind === 'unrecognized') return result.excerpt.fingerprint;
  return null;
}

export const resultDialog = (result: DialogParseResult): BlockedDialog | null =>
  result.kind === 'dialog' ? result.dialog : null;
