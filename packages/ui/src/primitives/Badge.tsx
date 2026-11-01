import { View } from 'react-native';
import { makeStyles } from '../theme/theme';
import { Text } from './Text';

const useStyles = makeStyles((t) => ({
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: t.colors.accentContainer,
    borderRadius: 999,
    paddingHorizontal: t.spacing.xs,
    paddingVertical: 2,
  },
}));

export function Badge({ label }: { label: string }) {
  const styles = useStyles();
  return (
    <View style={styles.badge}>
      <Text variant="label" tone="accent">
        {label}
      </Text>
    </View>
  );
}
