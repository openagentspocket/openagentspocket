import { type HostReading, quickContent } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Button, EmptyState, Sheet, Text } from '@openagentspocket/ui';
import { QuickCardView } from './QuickCardView';
import { renderMessage } from './usageText';

interface Props {
  visible: boolean;
  onClose: () => void;
  readings: readonly HostReading[];
  now: Date;
  onOpenFull: () => void;
}

/** usage.quick-sheet: every Host's Usage Limits at a glance, with the way to the full Usage tab. */
export function QuickSheet({ visible, onClose, readings, now, onOpenFull }: Props) {
  const { cards, empty } = quickContent(readings, now);
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('Usage Limits')}
      detent="large"
      closeLabel={t('Close')}
      footer={<Button title={t('Open full Usage')} kind="secondary" onPress={onOpenFull} />}
      testID="usage-quick-sheet"
    >
      {cards.map((card) => (
        <QuickCardView key={card.id} card={card} now={now} />
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
