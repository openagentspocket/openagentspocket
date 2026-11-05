import { type FileTransfer, formatBytes, progressFraction } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Button, Card, Icon, Meter, makeStyles, Text } from '@openagentspocket/ui';
import { View } from 'react-native';

const useStyles = makeStyles((theme) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  name: { flex: 1 },
}));

/** The transfer in flight: its name, bytes moved, a bar when the total is known, and Cancel. */
export function TransferBar({
  transfer,
  onCancel,
}: {
  transfer: FileTransfer;
  onCancel: () => void;
}) {
  const styles = useStyles();
  const fraction = progressFraction(transfer.progress);
  const name = transfer.preparing ? t('Preparing…') : transfer.name;
  const moved = formatBytes(transfer.progress.transferredBytes);
  return (
    <Card level="overlay" testID="transfer-bar">
      <View style={styles.row}>
        <Icon name={transfer.direction === 'download' ? 'arrowDown' : 'arrowUp'} />
        <View style={styles.name}>
          <Text variant="callout" numberOfLines={1}>
            {name}
          </Text>
          {transfer.preparing ? null : (
            <Text variant="footnote" tone="secondary">
              {fraction === null
                ? moved
                : `${moved} / ${formatBytes(transfer.progress.totalBytes)}`}
            </Text>
          )}
        </View>
        <Button
          title={t('Cancel')}
          kind="text"
          size="small"
          onPress={onCancel}
          testID="transfer-cancel"
        />
      </View>
      {fraction === null ? null : <Meter value={fraction} accessibilityLabel={name} />}
    </Card>
  );
}
