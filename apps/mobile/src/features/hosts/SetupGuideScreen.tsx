import { t } from '@openagentspocket/i18n';
import { Card, Screen, Segmented, SheetBar, Text } from '@openagentspocket/ui';
import { useState } from 'react';
import { View } from 'react-native';
import { SetupStep } from './SetupStep';
import { guideSteps, type SetupPlatform } from './setupGuideSteps';

interface SetupGuideScreenProps {
  onBack: () => void;
}

/** hosts.setup-guide: how to prepare a machine (macOS / Linux or Windows) and add it as a Host. */
export function SetupGuideScreen({ onBack }: SetupGuideScreenProps) {
  const [platform, setPlatform] = useState<SetupPlatform>('unix');
  const steps = guideSteps(platform);
  return (
    <Screen
      header={
        <SheetBar
          title={t('Setup Guide')}
          back
          leading={{ label: t('Back'), onPress: onBack, testID: 'guide-back' }}
        />
      }
      edges={['left', 'right', 'bottom']}
      testID="setup-guide"
    >
      <View style={{ gap: 8 }}>
        <Segmented
          options={[
            { value: 'unix', label: t('macOS / Linux') },
            { value: 'windows', label: t('Windows') },
          ]}
          value={platform}
          onChange={setPlatform}
          testID="guide-platform"
        />
        <Text variant="footnote" tone="secondary">
          {t('Agentico connects over SSH to a machine that runs herdr.')}
        </Text>
      </View>
      <Card padded={false}>
        {steps.map((step, index) => (
          <SetupStep key={step.title} number={index + 1} step={step} divider={index > 0} />
        ))}
      </Card>
    </Screen>
  );
}
