import { type ReactNode, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Icon, type IconName } from '../primitives/Icon';
import { Tappable } from '../primitives/Tappable';
import { Text } from '../primitives/Text';
import { makeStyles } from '../theme/theme';

/** One key of a toolbar row. Tables of these come from the terminal's key data, not from code. */
export interface KeySpec {
  id: string;
  label: string;
  icon?: IconName;
  /** Spoken name when the label is a glyph ("Escape", "Up arrow"). */
  accessibilityLabel?: string;
  /** A sticky modifier: tapping it latches it for the next key. */
  modifier?: KeyModifier;
}

/** One-shot modifiers, as Swift's TerminalKeyModifiers: Ctrl, Alt (Option) and Shift. */
export type KeyModifier = 'ctrl' | 'alt' | 'shift';

export type KeyModifiers = Record<KeyModifier, boolean>;

const NONE: KeyModifiers = { ctrl: false, alt: false, shift: false };

const useStyles = makeStyles((t) => ({
  row: { gap: t.spacing.xxs, paddingHorizontal: t.spacing.xs },
  key: {
    minWidth: 40,
    height: 36,
    paddingHorizontal: t.spacing.xs,
    borderRadius: t.metrics.chipRadius,
    backgroundColor: t.colors.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  latched: { backgroundColor: t.colors.accent },
  pressed: { opacity: 0.6 },
  dock: {
    backgroundColor: t.colors.surfaceRaised,
    borderTopWidth: t.metrics.hairlineWidth,
    borderTopColor: t.hairline,
    paddingTop: t.spacing.xs,
    // The host screen keeps the dock clear of the home indicator (`useChromeInsets`).
    paddingBottom: t.spacing.xxs,
    gap: t.spacing.xs,
  },
}));

interface KeyRowProps {
  keys: readonly KeySpec[];
  /** A key was tapped, with the modifiers latched before it. */
  onKey: (key: KeySpec, modifiers: KeyModifiers) => void;
  /** Latched modifiers, owned by the dock so they span rows. */
  latched?: KeyModifiers;
  onToggleModifier?: (modifier: KeyModifier) => void;
}

/** One scrolling row of keys. */
export function KeyRow({ keys, onKey, latched = NONE, onToggleModifier }: KeyRowProps) {
  const styles = useStyles();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="always"
      contentContainerStyle={styles.row}
    >
      {keys.map((key) => {
        const on = key.modifier ? latched[key.modifier] : false;
        return (
          <Tappable
            key={key.id}
            onPress={() => (key.modifier ? onToggleModifier?.(key.modifier) : onKey(key, latched))}
            accessibilityRole={key.modifier ? 'togglebutton' : 'keyboardkey'}
            accessibilityLabel={key.accessibilityLabel ?? key.label}
            accessibilityState={key.modifier ? { checked: on, selected: on } : undefined}
            style={({ pressed }) => [styles.key, on && styles.latched, pressed && styles.pressed]}
            testID={`key-${key.id}`}
          >
            {key.icon ? (
              <Icon name={key.icon} size={15} color={on ? 'onAccent' : 'textPrimary'} />
            ) : (
              <Text variant="callout" tone={on ? 'onAccent' : 'primary'}>
                {key.label}
              </Text>
            )}
          </Tappable>
        );
      })}
    </ScrollView>
  );
}

interface KeyboardDockProps {
  rows: readonly (readonly KeySpec[])[];
  /** A key was tapped with these modifiers; latched modifiers release after one key (Sticky Ctrl). */
  onKey: (key: KeySpec, modifiers: KeyModifiers) => void;
  /** Extra controls above the keys (a snippets button, a keyboard toggle). */
  toolbar?: ReactNode;
  testID?: string;
}

/** The terminal's key dock: rows of data-driven keys with sticky Ctrl, Alt and Shift. */
export function KeyboardDock({
  rows,
  onKey,
  toolbar,
  testID = 'keyboard-dock',
}: KeyboardDockProps) {
  const styles = useStyles();
  const [latched, setLatched] = useState<KeyModifiers>(NONE);
  const press = (key: KeySpec, modifiers: KeyModifiers) => {
    onKey(key, modifiers);
    setLatched(NONE);
  };
  return (
    <View style={styles.dock} testID={testID}>
      {toolbar}
      {rows.map((keys, index) => (
        <KeyRow
          // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional.
          key={index}
          keys={keys}
          onKey={press}
          latched={latched}
          onToggleModifier={(modifier) =>
            setLatched((current) => ({ ...current, [modifier]: !current[modifier] }))
          }
        />
      ))}
    </View>
  );
}
