import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { makeStyles } from '../theme/theme';

const useStyles = makeStyles((t) => ({
  card: {
    backgroundColor: t.colors.surface,
    borderRadius: t.metrics.cardRadius,
    borderWidth: t.metrics.hairlineWidth,
    borderColor: t.hairline,
    padding: t.spacing.md,
    gap: t.spacing.xs,
  },
  pressed: { backgroundColor: t.colors.surfaceRaised },
}));

interface CardProps {
  children: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
}

export function Card({ children, onPress, accessibilityLabel, testID }: CardProps) {
  const styles = useStyles();
  if (!onPress) {
    return (
      <View style={styles.card} testID={testID} accessibilityLabel={accessibilityLabel}>
        {children}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      {children}
    </Pressable>
  );
}
