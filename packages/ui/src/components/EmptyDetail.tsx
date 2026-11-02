import { Pressable, View } from 'react-native';
import { Icon, type IconName } from '../primitives/Icon';
import { Text } from '../primitives/Text';
import { withAlpha } from '../theme/color';
import { makeStyles, useTheme } from '../theme/theme';

const useStyles = makeStyles((t) => ({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.spacing.sm,
    padding: t.metrics.screenInset,
  },
  copy: { alignItems: 'center', gap: t.spacing.xxs, maxWidth: 420 },
  centered: { textAlign: 'center' },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.spacing.xs,
    minHeight: t.metrics.minTapSize,
    minWidth: 240,
    paddingHorizontal: t.spacing.lg,
    borderRadius: 999,
    marginTop: t.spacing.xs,
  },
  pressed: { opacity: 0.7 },
}));

interface EmptyDetailProps {
  icon?: IconName;
  title: string;
  message: string;
  action?: { label: string; shortcut?: string; onPress: () => void };
  testID?: string;
}

/** The iPad detail column with nothing selected: glyph, title, message and a tinted capsule action. */
export function EmptyDetail({
  icon = 'windows',
  title,
  message,
  action,
  testID = 'empty-detail',
}: EmptyDetailProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View style={styles.root} testID={testID}>
      <Icon name={icon} size={48} />
      <View style={styles.copy}>
        <Text variant="title2" accessibilityRole="header" style={styles.centered}>
          {title}
        </Text>
        <Text variant="callout" tone="secondary" style={styles.centered}>
          {message}
        </Text>
      </View>
      {action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onPress={action.onPress}
          style={({ pressed }) => [
            styles.action,
            { backgroundColor: withAlpha(theme.colors.accent, 0.18) },
            pressed ? styles.pressed : null,
          ]}
          testID={`${testID}-action`}
        >
          <Icon name="add" size={16} color="accent" />
          <Text variant="callout" tone="accent">
            {action.label}
          </Text>
          {action.shortcut ? (
            <Text variant="caption2" tone="secondary">
              {action.shortcut}
            </Text>
          ) : null}
        </Pressable>
      ) : null}
    </View>
  );
}
