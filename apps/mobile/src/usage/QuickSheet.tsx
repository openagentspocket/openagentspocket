import type { HostReading } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Button, EmptyState, makeStyles, Sheet, Text, ToggleRow } from '@openagentspocket/ui';
import { useMemo } from 'react';
import { View } from 'react-native';
import { ProviderUsageList } from './ProviderUsageList';
import { type ProviderModels, providerModels } from './providerCards';
import { renderMessage } from './usageText';

const CLOSED: ProviderModels = { cards: [], footer: null, empty: null };

const useStyles = makeStyles((th) => ({
  footer: { gap: th.spacing.xs },
  note: { textAlign: 'center' },
}));

interface Props {
  visible: boolean;
  onClose: () => void;
  onDismissed?: () => void;
  readings: readonly HostReading[];
  now: Date;
  onOpenFull: () => void;
  /** The device's Claude Code limits switch, for a card whose limits are off. */
  onClaudeLimits?: (enabled: boolean) => void;
}

/** usage.quick-sheet: every Host's Usage Limits at a glance, with the way to the full Usage tab. */
export function QuickSheet({
  visible,
  onClose,
  onDismissed,
  readings,
  now,
  onOpenFull,
  onClaudeLimits,
}: Props) {
  const styles = useStyles();
  // A closed sheet computes nothing: Home mounts it for the whole session.
  const { cards, footer, empty } = useMemo(
    () => (visible ? providerModels(readings, now) : CLOSED),
    [visible, readings, now],
  );
  const claudeOff = onClaudeLimits
    ? cards.filter((c) => c.providerId === 'claude' && c.state === 'off')
    : [];
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      onDismissed={onDismissed}
      title={t('Usage')}
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
      <ProviderUsageList cards={cards} footer={footer} onOpen={onOpenFull} />
      {claudeOff.map((card) => (
        <View key={card.key} style={styles.footer}>
          <ToggleRow
            title={t('Claude Code limits')}
            value={false}
            onValueChange={(enabled) => onClaudeLimits?.(enabled)}
            testID={`claude-limits-toggle-${card.hostId}`}
          />
          <Text variant="footnote" tone="secondary">
            {t(
              'The plugin asks Claude Code on this computer for your plan limits. Neither the plugin nor Agentico handles your sign-in. This automated use is not officially supported.',
            )}
          </Text>
        </View>
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
