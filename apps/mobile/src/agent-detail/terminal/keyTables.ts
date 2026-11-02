import {
  character,
  FUNCTION_KEYS,
  keyTitle,
  type Modifier,
  type QuickKey,
  quickKeyId,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import type { IconName, KeySpec } from '@openagentspocket/ui';

/** Keys the dock rows carry, as data; a row cell is a quick key or a sticky modifier. */
type Cell = QuickKey | { readonly modifier: Modifier };

const ARROW_ICONS: Record<string, IconName> = {
  left: 'arrowLeft',
  up: 'arrowUp',
  down: 'arrowDown',
  right: 'arrowRight',
};

const SPOKEN: Record<string, () => string> = {
  escape: () => t('Escape'),
  tab: () => t('Tab'),
  shiftTab: () => t('Shift Tab'),
  shiftEnter: () => t('Shift Enter'),
  left: () => t('Left Arrow'),
  up: () => t('Up Arrow'),
  down: () => t('Down Arrow'),
  right: () => t('Right Arrow'),
  enter: () => t('Enter'),
  backspace: () => t('Backspace'),
  home: () => t('Home'),
  end: () => t('End'),
  insert: () => t('Insert'),
  forwardDelete: () => t('Forward Delete'),
  pageUp: () => t('Page Up'),
  pageDown: () => t('Page Down'),
};

/** The spoken name of a key (Swift `AgentQuickKey.accessibilityLabel`). */
export function spokenName(key: QuickKey): string {
  if (typeof key !== 'string') return key.character === ' ' ? t('Space') : key.character;
  return SPOKEN[key]?.() ?? key.toUpperCase();
}

const MODIFIERS: Record<Modifier, { label: string; spoken: () => string }> = {
  control: { label: 'Ctrl', spoken: () => t('Control modifier') },
  option: { label: 'Alt', spoken: () => t('Option modifier') },
  shift: { label: 'Shift', spoken: () => t('Shift modifier') },
};

/** The dock's key for `key`; the id is the quick key's id so a tap maps back through `lookup`. */
export function keySpec(key: QuickKey): KeySpec {
  const icon = typeof key === 'string' ? ARROW_ICONS[key] : undefined;
  return {
    id: quickKeyId(key),
    label: keyTitle(key) ?? '',
    icon,
    accessibilityLabel: spokenName(key),
  };
}

/** Maps a tapped `KeySpec` id back to its quick key. */
export type KeyLookup = ReadonlyMap<string, QuickKey>;

export interface KeyRows {
  readonly rows: readonly (readonly KeySpec[])[];
  readonly lookup: KeyLookup;
}

function build(cells: readonly (readonly Cell[])[]): KeyRows {
  const lookup = new Map<string, QuickKey>();
  const rows = cells.map((row) =>
    row.map((cell): KeySpec => {
      if (typeof cell === 'object' && 'modifier' in cell) {
        const info = MODIFIERS[cell.modifier];
        const ui =
          cell.modifier === 'control' ? 'ctrl' : cell.modifier === 'option' ? 'alt' : 'shift';
        return {
          id: `mod-${cell.modifier}`,
          label: info.label,
          accessibilityLabel: info.spoken(),
          modifier: ui,
        };
      }
      lookup.set(quickKeyId(cell), cell);
      return keySpec(cell);
    }),
  );
  return { rows, lookup };
}

const chars = (text: string): QuickKey[] => [...text].map(character);

const MODS: Cell[] = [{ modifier: 'control' }, { modifier: 'option' }, { modifier: 'shift' }];

/** Controls: the keys a TUI wants and the system keyboard lacks (Swift Control Keys pane). */
export const CONTROL_KEYS: KeyRows = build([
  [...MODS, 'escape', 'tab', 'shiftTab', 'backspace', 'forwardDelete'],
  ['left', 'up', 'down', 'right', 'home', 'end', 'pageUp', 'pageDown'],
  ['shiftEnter', 'enter', 'insert', ...chars('/\\|~`-_')],
  FUNCTION_KEYS,
]);

/** The full keyboard: US QWERTY with the sticky modifiers, one scrolling row per line. */
export const FULL_KEYBOARD: KeyRows = build([
  [...FUNCTION_KEYS, 'escape'],
  [...chars('`1234567890-='), 'backspace'],
  ['tab', ...chars('qwertyuiop[]\\')],
  [...chars("asdfghjkl;'"), 'enter'],
  [{ modifier: 'shift' }, ...chars('zxcvbnm,./'), 'up'],
  [{ modifier: 'control' }, { modifier: 'option' }, character(' '), 'left', 'down', 'right'],
]);

/** The menu's Commands > Keys, as dock keys. */
export const keyLabel = (key: QuickKey): string => keyTitle(key) ?? spokenName(key);
