import { highestRunningPercent, limitLevel } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { UsageRing, type UsageTone } from '@openagentspocket/ui';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { QuickSheet } from '@/usage/QuickSheet';
import { useUsage } from '@/usage/useUsage';

const TONE = { normal: 'ok', warning: 'warn', danger: 'critical' } as const satisfies Record<
  string,
  UsageTone
>;

/**
 * The Usage ring of Home's title capsule: the fullest running Usage window from the readings the
 * Usage store holds. `ring` goes in the capsule, `sheet` anywhere on the screen; tapping opens
 * the Usage Limits sheet, which leads on to the full Usage screen.
 */
export function useUsageRing() {
  const router = useRouter();
  const { readings, now } = useUsage();
  const [open, setOpen] = useState(false);
  const percent = readings ? highestRunningPercent(readings, now) : null;
  const ring = (
    <UsageRing
      percent={percent}
      tone={TONE[limitLevel(percent ?? 0)]}
      onPress={() => setOpen(true)}
      accessibilityLabel={t('Usage')}
      testID="home-usage-ring"
    />
  );
  const sheet = (
    <QuickSheet
      visible={open}
      onClose={() => setOpen(false)}
      readings={readings ?? []}
      now={now}
      onOpenFull={() => {
        setOpen(false);
        router.push('/usage');
      }}
    />
  );
  return { ring, sheet, open: () => setOpen(true), percent };
}

/** The ring and its sheet side by side (tests and places without a title capsule). */
export function UsageRingSlot() {
  const { ring, sheet } = useUsageRing();
  return (
    <>
      {ring}
      {sheet}
    </>
  );
}
