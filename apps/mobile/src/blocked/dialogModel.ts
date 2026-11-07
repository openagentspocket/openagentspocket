import type {
  BlockedDialog,
  BlockedDialogKind,
  CardProgress,
  DialogOption,
  DialogOptionRole,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';

const STOP_LESS: readonly BlockedDialogKind[] = [
  'codexAsyncQuestion',
  'grokQuestion',
  'grokCancelTurn',
  'grokFork',
];

const QUESTIONS: readonly BlockedDialogKind[] = [
  'claudeQuestion',
  'codexQuestion',
  'codexAsyncQuestion',
  'ompQuestion',
  'grokQuestion',
  'openCodeQuestion',
];

/** The card's heading: what a question asks, the dialog's title, or a name for poorly worded kinds. */
export function cardTitle(dialog: BlockedDialog): string {
  if (QUESTIONS.includes(dialog.kind)) return dialog.subject.question ?? t('Question');
  if (dialog.kind === 'codexAsyncCollapsed') return t('Questions');
  if (dialog.kind === 'ompApproval') return t('Allow %@', dialog.subject.toolName ?? t('Tool'));
  return dialog.title.endsWith(':') ? dialog.title.slice(0, -1) : dialog.title;
}

/** Whether Stop (Esc) does something a card can name. */
export const dialogCanStop = (dialog: BlockedDialog): boolean => !STOP_LESS.includes(dialog.kind);

/** What Stop does, for an open card whose options do not already send Esc. */
export function stopTitle(dialog: BlockedDialog): string {
  switch (dialog.kind) {
    case 'claudeWorkspaceTrust':
      return t('Exit Claude Code');
    case 'ompApproval':
    case 'grokPermission':
      return t('Deny');
    case 'openCodePermission':
      return t('Reject');
    case 'openCodeQuestion':
      return t('Dismiss');
    default:
      return t('Stop');
  }
}

/**
 * The Stop button's label, or null when none shows: always when no option sends Esc, otherwise
 * only once an answer went unconfirmed (then Esc is the way out, whatever the options say).
 */
export function stopLabel(dialog: BlockedDialog, progress: CardProgress): string | null {
  if (!dialogCanStop(dialog)) return null;
  const optionSendsEsc = dialog.options.some(
    (option) =>
      option.role === 'decline' || option.role === 'exitProgram' || option.role === 'cancel',
  );
  if (!optionSendsEsc) return stopTitle(dialog);
  return progress === 'unconfirmed' ? t('Stop') : null;
}

/** Only the lead approval is solid; one that saves a rule reads as a quieter second answer. */
const APPROVING: readonly DialogOptionRole[] = ['approve', 'approveModeSwitch'];

/** The button style of an option: approvals lead, declines warn, the rest stay quiet. */
export function optionKind(option: DialogOption): 'primary' | 'secondary' | 'destructive' {
  if (APPROVING.includes(option.role)) return 'primary';
  if (option.role === 'decline' || option.role === 'exitProgram') return 'destructive';
  return 'secondary';
}

/** Matches the planner: only Claude's multi-select takes a set; Oh My Pi's stay in the terminal. */
export const isMultiSelect = (dialog: BlockedDialog): boolean =>
  dialog.kind === 'claudeQuestion' && dialog.options.some((option) => option.role === 'next');

/** Options a tap can send; a text option needs typing, which the terminal does. */
export const isTappable = (option: DialogOption): boolean =>
  option.role !== 'otherText' && option.input === null;
