import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import type { ChatProgram } from '../chat/model/types';
import { comparable } from './comparable';
import type { BlockedDialogKind, DialogOption } from './types';

/**
 * Identifies a dialog by what it asks, not by where the user is in it (Swift's
 * DialogFingerprint). Before sending keys the card re-reads the screen and compares
 * fingerprints: a different one means the dialog changed and the keys would land on something
 * the user never saw. Focus, check marks, typed text, the footer and counters stay out;
 * whitespace stays out too, so the same dialog wrapped at another width keeps its fingerprint.
 */
export interface DialogFingerprint {
  /** The SHA-256 digest as lowercase hex. */
  readonly value: string;
  /** The digest of the lines about the request, when the read shows them (OpenCode). */
  readonly requestLines: string | null;
  /** The digest of the rule's lines shown in their place. */
  readonly ruleLines: string | null;
}

const FIELD_SEPARATOR = '\u001e';
const ITEM_SEPARATOR = '\u001f';

function digest(fields: readonly string[]): string {
  const canonical = fields.map(comparable).join(FIELD_SEPARATOR);
  return bytesToHex(sha256(utf8ToBytes(canonical)));
}

const list = (items: readonly string[]): string => items.map(comparable).join(ITEM_SEPARATOR);

/** A text field's label is whatever the user typed into it once they type. */
const fingerprintLabel = (option: DialogOption): string =>
  option.role === 'otherText' && option.input !== null ? '\u001ainput' : option.label;

export interface FingerprintInput {
  program: ChatProgram;
  kind: BlockedDialogKind;
  title: string;
  sourceSuffix: string | null;
  body: readonly string[];
  progress: string | null;
  options: readonly DialogOption[];
  requestLines?: readonly string[] | null;
  ruleLines?: readonly string[] | null;
}

export function dialogFingerprint(input: FingerprintInput): DialogFingerprint {
  const heading = input.title + (input.sourceSuffix === null ? '' : `·${input.sourceSuffix}`);
  const optionFields = input.options.map(
    (option) => `${option.number ?? '-'}:${fingerprintLabel(option)}`,
  );
  return {
    value: digest([
      input.program,
      input.kind,
      heading,
      list(input.body),
      input.progress ?? '',
      list(optionFields),
    ]),
    requestLines: input.requestLines ? digest([list(input.requestLines)]) : null,
    ruleLines: input.ruleLines ? digest([list(input.ruleLines)]) : null,
  };
}

/** For the generic card: the excerpt's rows without pointer glyphs (footer rows left out). */
export function excerptFingerprint(
  program: ChatProgram,
  excerptRows: readonly string[],
): DialogFingerprint {
  const rows = excerptRows.map((row) => {
    let trimmed = row.replace(/^[\p{Zs}\t]+|[\p{Zs}\t]+$/gu, '');
    while (trimmed.startsWith('❯') || trimmed.startsWith('›')) trimmed = trimmed.slice(1);
    return trimmed;
  });
  return {
    value: digest([program, 'generic', list(rows)]),
    requestLines: null,
    ruleLines: null,
  };
}

const agree = (a: string | null, b: string | null): boolean => a === null || b === null || a === b;

/** Whether `other` can be a read of the same dialog: same value, with the lines both show alike. */
export function fingerprintsMatch(a: DialogFingerprint, b: DialogFingerprint): boolean {
  return (
    a.value === b.value && agree(a.requestLines, b.requestLines) && agree(a.ruleLines, b.ruleLines)
  );
}

/** This read with the lines that `other`, a read of the same dialog, shows and this one doesn't. */
export function mergeFingerprints(a: DialogFingerprint, b: DialogFingerprint): DialogFingerprint {
  return {
    value: a.value,
    requestLines: a.requestLines ?? b.requestLines,
    ruleLines: a.ruleLines ?? b.ruleLines,
  };
}

export function describeFingerprint(fingerprint: DialogFingerprint): string {
  return (
    fingerprint.value.slice(0, 12) +
    (fingerprint.requestLines ? `+r${fingerprint.requestLines.slice(0, 6)}` : '') +
    (fingerprint.ruleLines ? `+a${fingerprint.ruleLines.slice(0, 6)}` : '')
  );
}
