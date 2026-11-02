import { utf8Encode } from '../pairing/bytes';
import type { KeyModifiers, QuickKey } from './quick-keys';

const ESC = 0x1b;

export interface EncodeOptions {
  /** DECCKM: arrows, Home and End use SS3 instead of CSI while no modifier is held. */
  readonly applicationCursor?: boolean;
}

const UNSHIFTED = "`1234567890-=[]\\;',./";
const SHIFTED = '~!@#$%^&*()_+{}|:"<>?';

/** The character a US-layout key produces under Shift. */
export function shiftedCharacter(value: string): string {
  const index = UNSHIFTED.indexOf(value);
  return index >= 0 ? (SHIFTED[index] ?? value) : value.toUpperCase();
}

/** xterm's modifier parameter: 1 + shift(1) + alt(2) + ctrl(4). */
export function modifierParameter(modifiers: KeyModifiers): number {
  return 1 + (modifiers.shift ? 1 : 0) + (modifiers.option ? 2 : 0) + (modifiers.control ? 4 : 0);
}

const hasAny = (m: KeyModifiers) => m.control || m.option || m.shift;
const text = (value: string) => utf8Encode(value);
const prefixAlt = (bytes: Uint8Array, alt: boolean): Uint8Array =>
  alt ? Uint8Array.of(ESC, ...bytes) : bytes;

/** xterm's Ctrl+digit row: 2 is NUL, 3..7 reach ESC..US, 8 is DEL. */
const CONTROL_DIGITS: Readonly<Record<string, number>> = {
  '2': 0x00,
  '3': 0x1b,
  '4': 0x1c,
  '5': 0x1d,
  '6': 0x1e,
  '7': 0x1f,
  '8': 0x7f,
};

/** Ctrl + a printable key as its legacy C0 control byte; null when no control byte exists. */
export function controlByte(value: string): number | null {
  if (value.length !== 1) return null;
  const code = value.charCodeAt(0);
  if (code >= 0x61 && code <= 0x7a) return code - 0x60;
  if (code >= 0x40 && code <= 0x5f) return code - 0x40; // A-Z @ [ \ ] ^ _
  if (value === ' ') return 0x00;
  if (value === '?') return 0x7f;
  return CONTROL_DIGITS[value] ?? null;
}

function csi(finalByte: string, modifiers: KeyModifiers, number?: number): Uint8Array {
  if (!hasAny(modifiers)) return text(`\u001b[${number ?? ''}${finalByte}`);
  return text(`\u001b[${number ?? 1};${modifierParameter(modifiers)}${finalByte}`);
}

const CURSOR_FINAL: Readonly<Record<string, string>> = {
  up: 'A',
  down: 'B',
  right: 'C',
  left: 'D',
  home: 'H',
  end: 'F',
};
const TILDE_NUMBER: Readonly<Record<string, number>> = {
  insert: 2,
  forwardDelete: 3,
  pageUp: 5,
  pageDown: 6,
  f5: 15,
  f6: 17,
  f7: 18,
  f8: 19,
  f9: 20,
  f10: 21,
  f11: 23,
  f12: 24,
};
const SS3_FINAL: Readonly<Record<string, string>> = { f1: 'P', f2: 'Q', f3: 'R', f4: 'S' };

function encodeCharacter(value: string, modifiers: KeyModifiers): Uint8Array | null {
  const typed = modifiers.shift ? shiftedCharacter(value) : value;
  if (modifiers.control) {
    const byte = controlByte(typed);
    return byte === null ? null : prefixAlt(Uint8Array.of(byte), modifiers.option);
  }
  return prefixAlt(text(typed), modifiers.option);
}

/**
 * Bytes a key sends on the wire (xterm legacy encoding, which the herdr TUIs read), or null for a
 * key with no encoding under the held modifiers. Replaces Ghostty's encoder, which the Swift
 * `AgenticoTerminalView.keyPress` table fed.
 *
 * Shift+Enter is Ctrl-J (the multiline action), whatever else is held.
 */
export function encodeQuickKey(
  key: QuickKey,
  modifiers: KeyModifiers,
  options: EncodeOptions = {},
): Uint8Array | null {
  if (typeof key !== 'string') return encodeCharacter(key.character, modifiers);
  if (key === 'shiftEnter' || (key === 'enter' && modifiers.shift)) {
    return prefixAlt(Uint8Array.of(0x0a), modifiers.option);
  }
  const held = key === 'shiftTab' ? { ...modifiers, shift: true } : modifiers;
  switch (key) {
    case 'escape':
      return prefixAlt(Uint8Array.of(ESC), held.option);
    case 'tab':
    case 'shiftTab':
      return held.shift
        ? prefixAlt(text('\u001b[Z'), held.option)
        : prefixAlt(Uint8Array.of(0x09), held.option);
    case 'enter':
      return prefixAlt(Uint8Array.of(held.control ? 0x0a : 0x0d), held.option);
    case 'backspace':
      return prefixAlt(Uint8Array.of(held.control ? 0x08 : 0x7f), held.option);
    case 'up':
    case 'down':
    case 'left':
    case 'right':
    case 'home':
    case 'end': {
      const final = CURSOR_FINAL[key] ?? 'A';
      if (!hasAny(held) && options.applicationCursor) return text(`\u001bO${final}`);
      return csi(final, held);
    }
    case 'insert':
    case 'forwardDelete':
    case 'pageUp':
    case 'pageDown':
    case 'f5':
    case 'f6':
    case 'f7':
    case 'f8':
    case 'f9':
    case 'f10':
    case 'f11':
    case 'f12':
      return csi('~', held, TILDE_NUMBER[key]);
    case 'f1':
    case 'f2':
    case 'f3':
    case 'f4': {
      const final = SS3_FINAL[key] ?? 'P';
      return hasAny(held) ? csi(final, held) : text(`\u001bO${final}`);
    }
    default:
      return null;
  }
}
