import { View } from 'react-native';
import { airy } from '../theme/metrics';
import { makeStyles } from '../theme/theme';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

const useStyles = makeStyles((t) => ({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: t.spacing.xxs,
    backgroundColor: t.colors.control,
    borderRadius: t.metrics.chipRadius,
    paddingHorizontal: airy.stack,
    paddingVertical: airy.chipV,
    maxWidth: '100%',
  },
  text: { flexShrink: 1 },
}));

interface MetaChipProps {
  label: string;
  /** A small leading symbol (host, folder, model). */
  icon?: IconName;
  testID?: string;
}

/**
 * Swift's `MetadataChip`: non-interactive technical metadata (host, workspace, model) in
 * caption2 monospace on the control fill. `Chip` is the selectable one.
 */
export function MetaChip({ label, icon, testID }: MetaChipProps) {
  const styles = useStyles();
  return (
    <View style={styles.chip} testID={testID} accessible accessibilityLabel={label}>
      {icon ? <Icon name={icon} size={11} color="textSecondary" /> : null}
      <Text variant="caption2" monospaced tone="secondary" numberOfLines={1} style={styles.text}>
        {label}
      </Text>
    </View>
  );
}
