import { dialogFingerprint } from './fingerprint';
import {
  type BlockedDialogKind,
  type DialogOption,
  type DialogParseResult,
  type DialogSubject,
  makeFocus,
} from './types';

export interface DialogParts {
  kind: BlockedDialogKind;
  title: string;
  positionLabel: string | null;
  body: string[];
  progress: string | null;
  options: DialogOption[];
  first: number;
  end: number;
  subject: DialogSubject;
  notes?: string | null;
}

export function dialog(parts: DialogParts): DialogParseResult {
  const focused = parts.options.find((option) => option.isFocused);
  return {
    kind: 'dialog',
    dialog: {
      kind: parts.kind,
      program: 'codex',
      title: parts.title,
      sourceSuffix: null,
      positionLabel: parts.positionLabel,
      body: parts.body,
      progress: parts.progress,
      options: parts.options,
      rows: { lowerBound: parts.first, upperBound: parts.end },
      fingerprint: dialogFingerprint({
        program: 'codex',
        kind: parts.kind,
        title: parts.title,
        sourceSuffix: null,
        body: parts.body,
        progress: parts.progress,
        options: parts.options,
      }),
      focus: makeFocus({
        focusedOrdinal: focused?.ordinal ?? null,
        notesText: parts.notes ?? null,
      }),
      subject: parts.subject,
      note: null,
    },
  };
}
