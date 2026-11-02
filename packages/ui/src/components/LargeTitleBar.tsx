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

interface LargeTitleBarProps {
  title: string;
  actions: readonly TitleBarAction[];
  testID?: string;
}

/** Swift's Home header: a 34 pt bold title at the screen inset, a glass capsule of actions at the trailing edge. */
export function LargeTitleBar({ title, actions, testID = 'large-title-bar' }: LargeTitleBarProps) {
  const styles = useStyles();
  return (
    <View style={styles.bar} testID={testID}>
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
      {actions.length > 0 ? (
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
      ) : null}
    </View>
  );
}
