import { t } from '@openagentspocket/i18n';
import { Chip, makeStyles } from '@openagentspocket/ui';
import { View } from 'react-native';

const useStyles = makeStyles((theme) => ({
  row: { paddingHorizontal: theme.metrics.screenInset, paddingVertical: theme.spacing.xs },
}));

/** The folder's path as a chip under the sheet bar (Swift: the `~/…` breadcrumb chip). */
export function PathChip({ path, loadingLabel }: { path: string | null; loadingLabel: string }) {
  const styles = useStyles();
  return (
    <View style={styles.row} accessibilityLabel={t('Path %@', path ?? '')}>
      <Chip size="small" label={path ?? loadingLabel} testID="files-path" />
    </View>
  );
}
