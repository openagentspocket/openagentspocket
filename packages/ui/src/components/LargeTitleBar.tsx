import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { impact } from '../haptics';
import { GlassCapsule } from '../primitives/GlassCapsule';
import { Icon, type IconName } from '../primitives/Icon';
import { Text } from '../primitives/Text';
import { makeStyles } from '../theme/theme';

export interface TitleBarAction {
  icon?: IconName;
  /** A custom glyph (the Usage ring) instead of an icon. */
  node?: ReactNode;
  label: string;
  onPress: () => void;
}

const useStyles = makeStyles((t) => ({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: t.metrics.screenInset,
    minHeight: t.metrics.minTapSize + t.spacing.xs,
  },
  title: { flex: 1 },
  long: { fontSize: 26, lineHeight: 32 },
  action: {
    width: 40,
    height: t.metrics.minTapSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
  capsule: { paddingHorizontal: t.spacing.xxs },
}));

function ActionCapsule({
  actions,
  testID,
}: {
  actions: readonly TitleBarAction[];
  testID: string;
}) {
  const styles = useStyles();
  if (actions.length === 0) return null;
  return (
    <GlassCapsule style={styles.capsule}>
      {actions.map((a) => (
        <Pressable
          key={a.label}
          style={styles.action}
          accessibilityRole="button"
          accessibilityLabel={a.label}
          onPress={() => {
            impact('light');
            a.onPress();
          }}
          testID={`${testID}-${a.label}`}
        >
          {a.node ?? (a.icon ? <Icon name={a.icon} size={20} color="accent" /> : null)}
        </Pressable>
      ))}
    </GlassCapsule>
  );
}

interface LargeTitleBarProps {
  /** Omitted when capsules lead the bar instead (Home). */
  title?: string;
  /** A capsule at the leading edge, drawn like the trailing one. */
  leadingActions?: readonly TitleBarAction[];
  actions: readonly TitleBarAction[];
  testID?: string;
}

/** Swift's Home header: a 34 pt bold title at the screen inset, glass capsules of actions at the edges. */
export function LargeTitleBar({
  title,
  leadingActions = [],
  actions,
  testID = 'large-title-bar',
}: LargeTitleBarProps) {
  const styles = useStyles();
  return (
    <View style={styles.bar} testID={testID}>
      <ActionCapsule actions={leadingActions} testID={`${testID}-leading`} />
      {title ? (
        <Text
          variant="title"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          accessibilityRole="header"
          style={[styles.title, title.length > 12 && styles.long]}
        >
          {title}
        </Text>
      ) : (
        <View style={styles.title} />
      )}
      <ActionCapsule actions={actions} testID={testID} />
    </View>
  );
}
