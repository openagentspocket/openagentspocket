import { type ReactNode, useRef, useState } from 'react';
import { PanResponder, Pressable, View } from 'react-native';
import { impact } from '../haptics';
import type { KeyModifier, KeyModifiers, KeySpec } from '../keys/KeyboardDock';
import { ActionMenuButton, type ActionMenuItem } from '../overlay/ActionMenu';
import { GlassCapsule } from '../primitives/GlassCapsule';
import { Icon, type IconName } from '../primitives/Icon';
import { Text } from '../primitives/Text';
import { makeStyles, useTheme } from '../theme/theme';
import { KeyboardDismissButton } from './KeyboardDismissButton';
import { useKeyRepeat } from './keyRepeat';

/** A sticky modifier: off, armed for the next key, or locked until tapped again. */
export type ModifierState = 'off' | 'armed' | 'locked';
export type ModifierStates = Record<KeyModifier, ModifierState>;

export const NO_MODIFIERS: ModifierStates = { ctrl: 'off', alt: 'off', shift: 'off' };

/** First tap arms, second tap locks, third clears. */
export function nextModifierState(state: ModifierState): ModifierState {
  return state === 'off' ? 'armed' : state === 'armed' ? 'locked' : 'off';
}

/** Armed modifiers release after one key; locked ones stay. */
export function afterKey(states: ModifierStates): ModifierStates {
  const next = { ...states };
  for (const modifier of Object.keys(next) as KeyModifier[])
    if (next[modifier] === 'armed') next[modifier] = 'off';
  return next;
}

const asActive = (states: ModifierStates): KeyModifiers => ({
  ctrl: states.ctrl !== 'off',
  alt: states.alt !== 'off',
  shift: states.shift !== 'off',
});

export type DpadDirection = 'up' | 'down' | 'left' | 'right';

/** The direction of a drag from the arrows glyph, or null while inside the dead zone. */
export function dpadDirection(dx: number, dy: number, deadZone = 24): DpadDirection | null {
  if (Math.hypot(dx, dy) < deadZone) return null;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

/** Ctrl, Esc, Tab: the keys the toolbar draws as text. */
export const defaultToolbarKeys: readonly KeySpec[] = [
  { id: 'ctrl', label: 'Ctrl', modifier: 'ctrl' },
  { id: 'esc', label: 'Esc', accessibilityLabel: 'Escape' },
  { id: 'tab', label: 'Tab' },
];

const DPAD_KEYS: Record<DpadDirection | 'enter', { icon: IconName; label: string }> = {
  up: { icon: 'chevronUp', label: 'Up arrow' },
  down: { icon: 'chevronDown', label: 'Down arrow' },
  left: { icon: 'chevronLeft', label: 'Left arrow' },
  right: { icon: 'chevronRight', label: 'Right arrow' },
  enter: { icon: 'enter', label: 'Enter' },
};

const useStyles = makeStyles((t) => ({
  capsule: {
    height: 52,
    paddingHorizontal: t.spacing.md,
    gap: t.spacing.xs,
    justifyContent: 'space-between',
  },
  key: {
    minHeight: t.metrics.minTapSize,
    minWidth: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.6 },
  popover: {
    position: 'absolute',
    bottom: 8,
    width: 176,
    height: 176,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  popKey: {
    position: 'absolute',
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hub: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.control,
  },
  arrowsWrap: { alignItems: 'center' },
}));

export interface TerminalToolbarLabels {
  dpad: string;
  keyboard: string;
  hideKeyboard: string;
  more: string;
}

export const defaultToolbarLabels: TerminalToolbarLabels = {
  dpad: 'Arrow keys',
  keyboard: 'Keyboard',
  hideKeyboard: 'Dismiss keyboard',
  more: 'More',
};

interface TerminalToolbarProps {
  keys?: readonly KeySpec[];
  /** A key was tapped or repeated, with the modifiers active before it. */
  onKey: (key: KeySpec, modifiers: KeyModifiers) => void;
  /** An arrow or Enter from the d-pad (tap or drag), with the active modifiers. */
  onDpad: (direction: DpadDirection | 'enter', modifiers: KeyModifiers) => void;
  /** The agent mark: omit for a shell. */
  leading?: ReactNode;
  onToggleKeyboard: () => void;
  /** More: snippets, paste, clear. */
  moreItems: readonly ActionMenuItem[];
  /** Starts with the d-pad popover lifted (long press on the arrows glyph). */
  defaultDpadOpen?: boolean;
  /** Initial modifier states, for a locked Ctrl. */
  defaultModifiers?: Partial<ModifierStates>;
  labels?: Partial<TerminalToolbarLabels>;
  testID?: string;
}

function ToolbarKey({
  spec,
  state,
  onModifier,
  onKey,
}: {
  spec: KeySpec;
  state: ModifierState;
  onModifier: () => void;
  onKey: () => void;
}) {
  const styles = useStyles();
  const repeat = useKeyRepeat(onKey);
  const on = state !== 'off';
  return (
    <Pressable
      style={({ pressed }) => [styles.key, pressed && styles.pressed]}
      onPress={spec.modifier ? onModifier : undefined}
      onPressIn={
        spec.modifier
          ? undefined
          : () => {
              impact('light');
              repeat.start();
            }
      }
      onPressOut={spec.modifier ? undefined : repeat.stop}
      accessibilityRole={spec.modifier ? 'togglebutton' : 'keyboardkey'}
      accessibilityLabel={spec.accessibilityLabel ?? spec.label}
      accessibilityState={spec.modifier ? { checked: on, selected: on } : undefined}
      accessibilityHint={state === 'locked' ? 'Locked' : undefined}
      testID={`toolbar-key-${spec.id}`}
    >
      <Text variant="body" monospaced semibold tone={on ? 'accent' : 'primary'}>
        {spec.label}
      </Text>
    </Pressable>
  );
}

function Dpad({
  onSend,
  label,
}: {
  onSend: (direction: DpadDirection | 'enter') => void;
  label: string;
}) {
  const styles = useStyles();
  const offsets: Record<
    DpadDirection,
    { top?: number; bottom?: number; left?: number; right?: number }
  > = {
    up: { top: 14, left: 66 },
    down: { bottom: 14, left: 66 },
    left: { left: 14, top: 66 },
    right: { right: 14, top: 66 },
  };
  return (
    <GlassCapsule style={styles.popover} testID="toolbar-dpad">
      <View accessibilityLabel={label} style={{ width: 176, height: 176 }}>
        {(Object.keys(offsets) as DpadDirection[]).map((direction) => (
          <Pressable
            key={direction}
            style={[styles.popKey, offsets[direction]]}
            onPress={() => {
              impact('light');
              onSend(direction);
            }}
            accessibilityRole="button"
            accessibilityLabel={DPAD_KEYS[direction].label}
            testID={`dpad-${direction}`}
          >
            <Icon name={DPAD_KEYS[direction].icon} size={20} color="textPrimary" />
          </Pressable>
        ))}
        <Pressable
          style={[styles.hub, { position: 'absolute', left: 60, top: 60 }]}
          onPress={() => {
            impact('light');
            onSend('enter');
          }}
          accessibilityRole="button"
          accessibilityLabel={DPAD_KEYS.enter.label}
          testID="dpad-enter"
        >
          <Icon name="enter" size={22} color="textPrimary" />
        </Pressable>
      </View>
    </GlassCapsule>
  );
}

/**
 * The terminal's key capsule: agent mark, Ctrl (sticky: tap arms, second tap locks), Esc, Tab,
 * the arrows glyph (long press lifts a d-pad; drag to a direction sends it), keyboard and More.
 */
export function TerminalToolbar({
  keys = defaultToolbarKeys,
  onKey,
  onDpad,
  leading,
  onToggleKeyboard,
  moreItems,
  defaultDpadOpen = false,
  defaultModifiers,
  labels,
  testID = 'terminal-toolbar',
}: TerminalToolbarProps) {
  const styles = useStyles();
  const theme = useTheme();
  const text = { ...defaultToolbarLabels, ...labels };
  const [mods, setMods] = useState<ModifierStates>({ ...NO_MODIFIERS, ...defaultModifiers });
  const [dpadOpen, setDpadOpen] = useState(defaultDpadOpen);
  const modsRef = useRef(mods);
  modsRef.current = mods;
  const send = (fire: (active: KeyModifiers) => void) => {
    fire(asActive(modsRef.current));
    setMods(afterKey(modsRef.current));
  };
  const drag = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: () => dpadOpenRef.current,
      onPanResponderRelease: (_e, g) => {
        const direction = dpadDirection(g.dx, g.dy);
        if (direction) send((active) => onDpadRef.current(direction, active));
        setDpadOpen(false);
      },
    }),
  ).current;
  const dpadOpenRef = useRef(dpadOpen);
  dpadOpenRef.current = dpadOpen;
  const onDpadRef = useRef(onDpad);
  onDpadRef.current = onDpad;
  return (
    <View testID={testID}>
      {dpadOpen ? (
        <View style={{ alignItems: 'center' }}>
          <Dpad
            label={text.dpad}
            onSend={(direction) => send((active) => onDpad(direction, active))}
          />
        </View>
      ) : null}
      <GlassCapsule style={styles.capsule} testID="toolbar-capsule">
        {leading}
        {keys.map((spec) => (
          <ToolbarKey
            key={spec.id}
            spec={spec}
            state={spec.modifier ? mods[spec.modifier] : 'off'}
            onModifier={() => {
              impact('light');
              const modifier = spec.modifier;
              if (modifier) setMods((c) => ({ ...c, [modifier]: nextModifierState(c[modifier]) }));
            }}
            onKey={() => send((active) => onKey(spec, active))}
          />
        ))}
        <View {...drag.panHandlers} style={styles.arrowsWrap}>
          <Pressable
            style={styles.key}
            onLongPress={() => {
              impact('light');
              setDpadOpen(true);
            }}
            onPress={() => setDpadOpen((open) => !open)}
            accessibilityRole="button"
            accessibilityLabel={text.dpad}
            accessibilityState={{ expanded: dpadOpen }}
            testID="toolbar-dpad-button"
          >
            <Icon
              name="dpad"
              size={22}
              tint={dpadOpen ? theme.colors.accent : theme.colors.textPrimary}
            />
          </Pressable>
        </View>
        <Pressable
          style={styles.key}
          onPress={() => {
            impact('light');
            onToggleKeyboard();
          }}
          accessibilityRole="button"
          accessibilityLabel={text.keyboard}
          testID="toolbar-keyboard"
        >
          <Icon name="keyboard" size={22} color="textPrimary" />
        </Pressable>
        <KeyboardDismissButton label={text.hideKeyboard} testID="toolbar-keyboard-dismiss" />
        <ActionMenuButton items={moreItems} accessibilityLabel={text.more} testID="toolbar-more" />
      </GlassCapsule>
    </View>
  );
}
