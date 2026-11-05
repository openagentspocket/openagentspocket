import { ActivityIndicator, Pressable, View } from 'react-native';
import { impact } from '../haptics';
import { GlassCapsule } from '../primitives/GlassCapsule';
import { Icon, type IconName } from '../primitives/Icon';
import { Text } from '../primitives/Text';
import { makeStyles, useTheme } from '../theme/theme';

export interface SheetBarItem {
  label: string;
  onPress: () => void;
  /** A glyph instead of the label (the label is then the accessibility name). */
  icon?: IconName;
  disabled?: boolean;
  /** A spinner in place of the label (a form that is launching); the action is inert meanwhile. */
  loading?: boolean;
  testID?: string;
}

const useStyles = makeStyles((t) => ({
  root: { paddingTop: t.spacing.sm, gap: t.spacing.xs },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: t.metrics.screenInset,
    minHeight: t.metrics.minTapSize + t.spacing.xs,
    gap: t.spacing.sm,
  },
  slot: { minWidth: 72, flexDirection: 'row' },
  slotEnd: { justifyContent: 'flex-end' },
  fill: { flex: 1 },
  title: { flex: 1, textAlign: 'center' },
  action: {
    minWidth: 40,
    minHeight: t.metrics.minTapSize,
    paddingHorizontal: t.spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  large: { paddingHorizontal: t.metrics.screenInset, paddingTop: t.spacing.xs },
  disabled: { opacity: 0.4 },
}));

interface SheetBarProps {
  title: string;
  /** Large bold title under the bar (Hosts, Settings) instead of centered in it. */
  large?: boolean;
  /** Leading capsule: Done, Cancel, or a round back chevron when `back` is set. */
  leading?: SheetBarItem;
  back?: boolean;
  /** Trailing capsule: one or several glyph actions (scan and add), or a word (Edit, Save). */
  trailing?: readonly SheetBarItem[];
  testID?: string;
}

/** One glass-capsule action of a sheet bar (also used by `Sheet`'s trailing confirm). */
export function BarAction({ action, testID }: { action: SheetBarItem; testID: string }) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Pressable
      style={[styles.action, (action.disabled || action.loading) && styles.disabled]}
      accessibilityRole="button"
      accessibilityLabel={action.label}
      accessibilityState={{ disabled: action.disabled || action.loading, busy: action.loading }}
      disabled={action.disabled || action.loading}
      onPress={() => {
        impact('light');
        action.onPress();
      }}
      testID={action.testID ?? testID}
    >
      {action.loading ? (
        <ActivityIndicator color={theme.colors.accent} />
      ) : action.icon ? (
        <Icon name={action.icon} size={20} color="accent" />
      ) : (
        <Text variant="body" tone="accent">
          {action.label}
        </Text>
      )}
    </Pressable>
  );
}

/**
 * The bar of a full-height sheet (Hosts, Settings): a glass capsule with Done / Cancel / back at
 * the leading edge, a glass capsule of actions at the trailing edge, and the title large under
 * the bar or centered in it.
 */
export function SheetBar({
  title,
  large = false,
  leading,
  back = false,
  trailing = [],
  testID = 'sheet-bar',
}: SheetBarProps) {
  const styles = useStyles();
  return (
    <View style={styles.root} testID={testID}>
      <View style={styles.bar}>
        <View style={styles.slot}>
          {leading ? (
            <GlassCapsule>
              <BarAction
                action={back ? { ...leading, icon: 'chevronLeft' } : leading}
                testID={`${testID}-leading`}
              />
            </GlassCapsule>
          ) : null}
        </View>
        {large ? (
          <View style={styles.fill} />
        ) : (
          <Text
            variant="headline"
            accessibilityRole="header"
            numberOfLines={1}
            style={styles.title}
          >
            {title}
          </Text>
        )}
        <View style={[styles.slot, styles.slotEnd]}>
          {trailing.length > 0 ? (
            <GlassCapsule>
              {trailing.map((action) => (
                <BarAction
                  key={action.label}
                  action={action}
                  testID={`${testID}-${action.label}`}
                />
              ))}
            </GlassCapsule>
          ) : null}
        </View>
      </View>
      {large ? (
        <Text variant="title" accessibilityRole="header" numberOfLines={1} style={styles.large}>
          {title}
        </Text>
      ) : null}
    </View>
  );
}
