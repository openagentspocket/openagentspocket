import { t } from '@openagentspocket/i18n';
import { Card, ListRow, Section, Segmented, Text } from '@openagentspocket/ui';
import { useState } from 'react';
import { Linking, View } from 'react-native';
import { AppScreen } from '@/navigation/AppScreen';
import { SetupStep } from './SetupStep';
import { GUIDE_URL, guideSteps, type SetupPlatform } from './setupGuideSteps';

interface SetupGuideScreenProps {
  onBack: () => void;
}

/** hosts.setup-guide: how to prepare a machine (macOS / Linux or Windows) and add it as a Host. */
export function SetupGuideScreen({ onBack }: SetupGuideScreenProps) {
  const [platform, setPlatform] = useState<SetupPlatform>('unix');
  const steps = guideSteps(platform);
  return (
    <AppScreen
      header={{
        variant: 'sheet',
        title: t('Setup Guide'),
        back: true,
        leading: { label: t('Back'), onPress: onBack, testID: 'guide-back' },
      }}
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
      <Section>
        <ListRow
          icon="book"
          title={t('Full Guide on GitHub')}
          chevron
          onPress={() => void Linking.openURL(GUIDE_URL)}
          testID="guide-full"
        />
      </Section>
    </AppScreen>
  );
}
