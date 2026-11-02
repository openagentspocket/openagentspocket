import { highestRunningPercent, limitLevel } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable } from 'react-native';
import { QuickSheet } from '@/usage/QuickSheet';
import { useUsage } from '@/usage/useUsage';
import { UsageRing } from './UsageRing';

/**
 * The Usage ring in Home's top bar: the fullest running Usage window from the readings the Usage
 * store holds. Tapping opens the Usage Limits sheet, which leads on to the full Usage screen.
 */
export function UsageRingSlot() {
  const router = useRouter();
  const { readings, now } = useUsage();
  const [open, setOpen] = useState(false);
  const percent = readings ? highestRunningPercent(readings, now) : null;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('Usage')}
        accessibilityValue={
          percent === null
            ? undefined
            : { text: t('%lld%% of a Usage Limit used', Math.round(percent)) }
        }
        accessibilityHint={t("Shows each account's Usage Limits")}
        onPress={() => setOpen(true)}
        hitSlop={8}
        style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
        testID="home-usage-ring"
      >
        <UsageRing percent={percent} level={limitLevel(percent ?? 0)} />
      </Pressable>
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
    </>
  );
}
