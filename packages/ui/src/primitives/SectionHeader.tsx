import { View } from 'react-native';
import { makeStyles } from '../theme/theme';
import { Badge } from './Badge';
import { type Status, StatusDot } from './StatusDot';
import { Text } from './Text';

const useStyles = makeStyles((t) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs },
  spacer: { flex: 1 },
}));

interface SectionHeaderProps {
  title: string;
  status?: Status;
  count?: number;
}

export function SectionHeader({ title, status, count }: SectionHeaderProps) {
  const styles = useStyles();
  return (
    <View style={styles.row} accessible accessibilityRole="header">
      {status ? <StatusDot status={status} /> : null}
      <Text variant="label" tone="secondary">
        {title.toUpperCase()}
      </Text>
      <View style={styles.spacer} />
      {count !== undefined ? <Badge label={String(count)} /> : null}
    </View>
  );
}
