import { type HostReading, quickContent } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Button, EmptyState, makeStyles, Sheet, Text } from '@openagentspocket/ui';
import { View } from 'react-native';
import { QuickCardView } from './QuickCardView';
import { renderMessage } from './usageText';

const useStyles = makeStyles((th) => ({
  footer: { gap: th.spacing.xs },
  note: { textAlign: 'center' },
}));

interface Props {
  visible: boolean;
  onClose: () => void;
  readings: readonly HostReading[];
  now: Date;
  onOpenFull: () => void;
  /** The device's Claude Code limits switch, for a card whose limits are off. */
  onClaudeLimits?: (enabled: boolean) => void;
}

/** usage.quick-sheet: every Host's Usage Limits at a glance, with the way to the full Usage tab. */
export function QuickSheet({ visible, onClose, readings, now, onOpenFull, onClaudeLimits }: Props) {
  const styles = useStyles();
  const { cards, empty } = quickContent(readings, now);
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('Usage')}
      detent="medium"
      closeLabel={t('Close')}
      footer={
        <View style={styles.footer}>
          <Button
            title={t('Open full Usage')}
            icon="chevronRight"
            onPress={onOpenFull}
            testID="open-full-usage"
          />
          <Text variant="footnote" tone="secondary" style={styles.note}>
            {t('Cost and tokens are in the full Usage screen.')}
          </Text>
        </View>
      }
      testID="usage-quick-sheet"
    >
      {cards.map((card) => (
        <QuickCardView
          key={card.id}
          card={card}
          now={now}
          claudeLimits={onClaudeLimits ? { onChange: onClaudeLimits } : undefined}
        />
      ))}
      {empty?.kind === 'noHosts' ? (
        <EmptyState
          title={t('No Hosts')}
          message={t('Add a Host to read its Usage.')}
          layout="compact"
        />
      ) : null}
      {empty?.kind === 'loading' ? (
        <EmptyState title={t('Loading Usage…')} layout="compact" />
      ) : null}
      {empty?.kind === 'unavailable'
        ? empty.reasons.map((reason) => (
            <Text key={renderMessage(reason)} tone="secondary">
              {renderMessage(reason)}
            </Text>
          ))
        : null}
    </Sheet>
  );
}
