import { t } from '@openagentspocket/i18n';
import { airy, Sheet, Text, useTheme } from '@openagentspocket/ui';
import { View } from 'react-native';
import { installerSteps } from './installerSteps';
import type { SetupPlatform } from './setupGuideSteps';

interface WhatHappensSheetProps {
  visible: boolean;
  platform: SetupPlatform;
  onClose: () => void;
}

/** What the one-line installer does, step by step (the same list as the script). */
export function WhatHappensSheet({ visible, platform, onClose }: WhatHappensSheetProps) {
  const theme = useTheme();
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('What happens')}
      detent="large"
      testID="what-happens-sheet"
    >
      <View style={{ gap: theme.spacing.md, paddingBottom: theme.spacing.md }}>
        {installerSteps(platform).map((step, index) => (
          <View key={step.title} style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <Text variant="headline" tone="accent" style={{ width: 22 }}>
              {String(index + 1)}
            </Text>
            <View style={{ flex: 1, gap: airy.line }}>
              <Text variant="headline">{step.title}</Text>
              <Text variant="subheadline" tone="secondary">
                {step.detail}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </Sheet>
  );
}
