import { buildUsageScope } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Screen, Skeleton } from '@openagentspocket/ui';
import { Stack } from 'expo-router';
import { BreakdownRows } from './UsageBreakdownSection';
import { useUsage } from './useUsage';

/** usage.breakdown-list: every model of the last 30 days in one card (Show All). */
export function UsageBreakdownListScreen() {
  const { readings } = useUsage();
  return (
    <Screen testID="usage-breakdown-list">
      <Stack.Screen options={{ headerShown: true, title: t('%@ · Last 30 days', t('Models')) }} />
      {readings === null ? (
        <Skeleton />
      ) : (
        <BreakdownRows scope={buildUsageScope(readings)} kind="models" metric="cost" />
      )}
    </Screen>
  );
}
