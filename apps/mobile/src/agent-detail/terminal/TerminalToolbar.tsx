import {
  DPAD_KEYS,
  leadingKeys,
  type QuickKey,
  quickKeyId,
  type TerminalKeyboardControl,
  type ToolbarConfiguration,
  type ToolbarKey,
  toolbarQuickKey,
  trailingKeys,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Icon, type IconName, makeStyles, Text } from '@openagentspocket/ui';
import { useSyncExternalStore } from 'react';
import { Pressable, View } from 'react-native';
import { keySpec, spokenName } from './keyTables';

const useStyles = makeStyles((th) => ({
  band: { alignItems: 'center', paddingVertical: th.spacing.xs, paddingHorizontal: th.spacing.md },
  capsule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.spacing.xxs,
    padding: th.spacing.xxs,
    borderRadius: 999,
    backgroundColor: th.colors.surfaceOverlay,
    borderWidth: th.metrics.hairlineWidth,
    borderColor: th.hairline,
  },
  key: {
    minWidth: th.metrics.minTapSize,
    height: th.metrics.minTapSize - 4,
    paddingHorizontal: th.spacing.sm,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: th.colors.control,
  },
  on: { backgroundColor: th.colors.accent },
  divider: { width: th.metrics.hairlineWidth, height: 20, backgroundColor: th.hairline },
  pressed: { opacity: 0.6 },
  pad: { flexDirection: 'row', gap: th.spacing.xs, paddingBottom: th.spacing.xs },
}));

const GLYPH: Partial<Record<ToolbarKey, IconName>> = {
  dPad: 'chevronUpDown',
  keyboard: 'keyboard',
  more: 'more',
};

interface Props {
  keyboard: TerminalKeyboardControl;
  configuration: ToolbarConfiguration;
  onKey: (key: QuickKey) => void;
  /** The full keyboard is up (the entry then offers the system keyboard back). */
  fullKeyboardShown: boolean;
  onToggleKeyboard: () => void;
  onMore: () => void;
  dPadOpen: boolean;
  onToggleDPad: (open: boolean) => void;
}

/** The floating capsule: sticky Ctrl, Esc, Tab, a D-pad, the keyboard switch and More. */
export function TerminalToolbar({
  keyboard,
  configuration,
  onKey,
  fullKeyboardShown,
  onToggleKeyboard,
  onMore,
  dPadOpen,
  onToggleDPad,
}: Props) {
  const styles = useStyles();
  useSyncExternalStore(keyboard.subscribe, keyboard.getSnapshot);
  const latch = keyboard.latch('control');

  const renderKey = (key: ToolbarKey) => {
    const quick = toolbarQuickKey(key);
    const isCtrl = key === 'control';
    const active = isCtrl ? latch !== 'off' : key === 'dPad' ? dPadOpen : false;
    const label = isCtrl ? 'Ctrl' : quick ? keySpec(quick).label : '';
    const spoken =
      key === 'dPad'
        ? t('D-pad')
        : key === 'keyboard'
          ? fullKeyboardShown
            ? t('iOS Keyboard')
            : t('Full Keyboard')
          : key === 'more'
            ? t('More')
            : isCtrl
              ? t('Control modifier')
              : quick
                ? spokenName(quick)
                : label;
    const press = () => {
      if (isCtrl) keyboard.toggleModifier('control');
      else if (key === 'dPad') onToggleDPad(!dPadOpen);
      else if (key === 'keyboard') onToggleKeyboard();
      else if (key === 'more') onMore();
      else if (quick) onKey(quick);
    };
    const glyph = GLYPH[key];
    return (
      <Pressable
        key={key}
        onPress={press}
        onLongPress={isCtrl ? () => keyboard.lockModifier('control') : undefined}
        accessibilityRole="button"
        accessibilityLabel={spoken}
        accessibilityValue={isCtrl ? { text: latch } : undefined}
        accessibilityState={{ selected: active }}
        style={({ pressed }) => [styles.key, active && styles.on, pressed && styles.pressed]}
        testID={`toolbar-${key}`}
      >
        {glyph ? (
          <Icon name={glyph} size={16} color={active ? 'onAccent' : 'textPrimary'} />
        ) : (
          <Text variant="callout" tone={active ? 'onAccent' : 'primary'}>
            {label}
          </Text>
        )}
      </Pressable>
    );
  };

  return (
    <View style={styles.band} testID="terminal-toolbar">
      {dPadOpen && configuration.showsDPad ? (
        <View style={styles.pad} accessibilityLabel={t('Arrow keys and Enter')} testID="dpad-pad">
          {DPAD_KEYS.map((key) => {
            const spec = keySpec(key);
            return (
              <Pressable
                key={quickKeyId(key)}
                onPress={() => onKey(key)}
                accessibilityRole="keyboardkey"
                accessibilityLabel={spec.accessibilityLabel}
                style={({ pressed }) => [styles.key, pressed && styles.pressed]}
                testID={`dpad-${quickKeyId(key)}`}
              >
                {spec.icon ? (
                  <Icon name={spec.icon} size={16} color="textPrimary" />
                ) : (
                  <Icon name="send" size={16} color="textPrimary" />
                )}
              </Pressable>
            );
          })}
        </View>
      ) : null}
      <View style={styles.capsule}>
        {leadingKeys(configuration).map(renderKey)}
        <View style={styles.divider} />
        {trailingKeys(configuration).map(renderKey)}
      </View>
    </View>
  );
}
