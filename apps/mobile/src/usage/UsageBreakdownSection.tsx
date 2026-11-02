import type { UsageScope } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { makeStyles, SectionHeader, Segmented } from '@openagentspocket/ui';
import { useState } from 'react';
import { View } from 'react-native';
import { type BreakdownKind, BreakdownRows } from './BreakdownRows';
import type { UsageMetric } from './usageText';

export { BreakdownRows, breakdownEntries } from './BreakdownRows';

/** Rows listed before the Show All row (Swift's `limit: 4`). */
export const BREAKDOWN_TOP = 4;

const useStyles = makeStyles((th) => ({
  root: { gap: th.spacing.xs },
}));

interface Props {
  scope: UsageScope;
  metric: UsageMetric;
  onDay: (date: string) => void;
  /** Pushes usage.breakdown-list for the chosen kind. */
  onShowAll: (kind: BreakdownKind) => void;
}

/** "Breakdown": Models, Directories or Days in a segmented control, four rows, then Show All. */
export function UsageBreakdownSection({ scope, metric, onDay, onShowAll }: Props) {
  const styles = useStyles();
  const [kind, setKind] = useState<BreakdownKind>('models');
  return (
    <View style={styles.root} testID="usage-breakdown">
      <SectionHeader title={t('Breakdown')} />
      <Segmented
        value={kind}
        onChange={setKind}
        options={[
          { value: 'models', label: t('Models') },
          { value: 'directories', label: t('Directories') },
          { value: 'days', label: t('Days') },
        ]}
        testID="usage-breakdown-kind"
      />
      <BreakdownRows
        scope={scope}
        kind={kind}
        metric={metric}
        limit={BREAKDOWN_TOP}
        onDay={onDay}
        onShowAll={() => onShowAll(kind)}
      />
    </View>
  );
}
