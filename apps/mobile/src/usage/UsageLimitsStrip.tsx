import { type HostReading, programDisplayName, quickContent } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { makeStyles, SectionHeader, UsageLimitChip } from '@openagentspocket/ui';
import { ScrollView, View } from 'react-native';
import { renderMessage } from './usageText';

const useStyles = makeStyles((th) => ({
  root: { gap: th.spacing.xs },
  strip: { gap: th.spacing.sm },
}));

interface Props {
  readings: readonly HostReading[];
  now: Date;
  onDetails: () => void;
}

/** "Usage Limits · per Host": one chip per Host and program with its latest window, then Details. */
export function UsageLimitsStrip({ readings, now, onDetails }: Props) {
  const styles = useStyles();
  const chips = quickContent(readings, now).cards.flatMap((card) => {
    if (card.body.kind !== 'windows') return [];
    const window = card.body.windows.filter((w) => w.usedPercent !== null && !w.isExpired).at(-1);
    return window && window.usedPercent !== null
      ? [{ card, window, percent: window.usedPercent }]
      : [];
  });
  if (chips.length === 0) return null;
  return (
    <View style={styles.root} testID="usage-limits-strip">
      <SectionHeader
        title={`${t('Usage Limits')} · ${t('per Host')}`}
        action={{ title: t('Details'), onPress: onDetails }}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}
      >
        {chips.map(({ card, window, percent }) => (
          <UsageLimitChip
            key={`${card.id}.${window.id}`}
            percent={percent}
            host={card.hostName}
            hostStatus="done"
            program={programDisplayName(card.program)}
            window={renderMessage(window.name)}
            onPress={onDetails}
            testID={`limit-chip-${card.id}`}
          />
        ))}
      </ScrollView>
    </View>
  );
}
