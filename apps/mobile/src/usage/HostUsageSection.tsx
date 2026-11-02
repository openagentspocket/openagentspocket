import { buildUsageScope, formatTokens, scopeTotal } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Icon, ListRow, makeStyles, Section, Text } from '@openagentspocket/ui';
import { View } from 'react-native';
import { localeTag, metricText } from './usageText';
import { useUsage } from './useUsage';

const useStyles = makeStyles((th) => ({
  summary: { gap: th.spacing.xxs, padding: th.spacing.md },
  line: { flexDirection: 'row', alignItems: 'baseline', gap: th.spacing.xs, flexWrap: 'wrap' },
  figure: { fontSize: 28, lineHeight: 34, fontWeight: '600' },
}));

interface Props {
  hostId: string;
  /** Shows this Host on the Usage screen. */
  onOpenUsage?: () => void;
}

/** usage.host-section: the Host's last 30 days and the way to Usage scoped to it. Nothing while it has no reading. */
export function HostUsageSection({ hostId, onOpenUsage }: Props) {
  const styles = useStyles();
  const { readings } = useUsage();
  const reading = readings?.find((r) => r.id === hostId);
  if (!reading || reading.state.kind !== 'available') return null;
  const scope = buildUsageScope([reading]);
  const total = scopeTotal(scope, 'last30Days');
  return (
    <Section grouped title={t('Usage')} testID="host-usage-section">
      <View style={styles.summary}>
        <Text variant="footnote" tone="secondary">
          {t('Estimated API cost · Last 30 days')}
        </Text>
        <View style={styles.line}>
          <Text style={styles.figure} tabularNums testID="host-usage-total">
            {metricText(total, 'cost')}
          </Text>
          <Text variant="footnote" tone="secondary" tabularNums>
            {t('%@ tokens on this Host', formatTokens(total.tokens.total, localeTag()))}
          </Text>
        </View>
      </View>
      {onOpenUsage ? (
        <ListRow
          title={t('Open in Usage')}
          leading={<Icon name="usage" size={22} color="accent" />}
          chevron
          onPress={onOpenUsage}
          testID="host-usage-open"
        />
      ) : null}
    </Section>
  );
}
