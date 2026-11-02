/** One-shot sticky modifiers (Swift `TerminalKeyModifiers`). */
export interface KeyModifiers {
  readonly control: boolean;
  readonly option: boolean;
  readonly shift: boolean;
}

export type Modifier = keyof KeyModifiers;

export const NO_MODIFIERS: KeyModifiers = { control: false, option: false, shift: false };

export const withModifier = (
  modifiers: KeyModifiers,
  modifier: Modifier,
  on: boolean,
): KeyModifiers => ({ ...modifiers, [modifier]: on });

export const unionModifiers = (a: KeyModifiers, b: KeyModifiers): KeyModifiers => ({
  control: a.control || b.control,
  option: a.option || b.option,
  shift: a.shift || b.shift,
});

export const NAMED_KEYS = [
  'escape',
  'tab',
  'shiftTab',
  'shiftEnter',
  'left',
  'up',
  'down',
  'right',
  'enter',
  'backspace',
  'home',
  'end',
  'insert',
  'forwardDelete',
  'pageUp',
  'pageDown',
] as const;
export type NamedKey = (typeof NAMED_KEYS)[number];

export const FUNCTION_KEYS = [
  'f1',
  'f2',
  'f3',
  'f4',
  'f5',
  'f6',
  'f7',
  'f8',
  'f9',
  'f10',
  'f11',
  'f12',
] as const;
export type FunctionKey = (typeof FUNCTION_KEYS)[number];

/** A key the toolbars and the full keyboard send (Swift `AgentQuickKey`). */
export type QuickKey = NamedKey | FunctionKey | { readonly character: string };

export const character = (value: string): QuickKey => ({ character: value });

export function sameKey(a: QuickKey, b: QuickKey): boolean {
  if (typeof a === 'string' || typeof b === 'string') return a === b;
  return a.character === b.character;
}

/** A stable id for lists and test ids. */
export const quickKeyId = (key: QuickKey): string =>
  typeof key === 'string' ? key : `char-${key.character === ' ' ? 'space' : key.character}`;

/** Key-cap text; arrows have none (they draw a glyph). */
export function keyTitle(key: QuickKey): string | null {
  if (typeof key !== 'string') return key.character === ' ' ? 'Space' : key.character;
  switch (key) {
    case 'escape':
      return 'Esc';
    case 'tab':
      return 'Tab';
    case 'shiftTab':
      return '⇧Tab';
    case 'shiftEnter':
      return '⇧Enter';
    case 'enter':
      return 'Enter';
    case 'backspace':
      return 'Backspace';
    case 'home':
      return 'Home';
    case 'end':
      return 'End';
    case 'insert':
      return 'Insert';
    case 'forwardDelete':
      return 'Forward Delete';
    case 'pageUp':
      return 'PgUp';
    case 'pageDown':
      return 'PgDn';
    case 'left':
    case 'up':
    case 'down':
    case 'right':
      return null;
    default:
      return key.toUpperCase();
  }
}
