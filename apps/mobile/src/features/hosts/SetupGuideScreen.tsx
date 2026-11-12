import { t } from '@openagentspocket/i18n';
import { Card, Text } from '@openagentspocket/ui';
import { AppScreen } from '@/navigation/AppScreen';
import { SetupStep } from './SetupStep';
import { guideSteps } from './setupGuideSteps';

interface SetupGuideScreenProps {
  onBack: () => void;
}

/** hosts.setup-guide: how to prepare a computer (macOS or Linux) and add it as a Host. */
export function SetupGuideScreen({ onBack }: SetupGuideScreenProps) {
  const steps = guideSteps();
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
      <Text variant="footnote" tone="secondary">
        {t('Agentico connects over SSH to a machine that runs herdr.')}
      </Text>
      <Card padded={false}>
        {steps.map((step, index) => (
          <SetupStep key={step.title} number={index + 1} step={step} divider={index > 0} />
        ))}
      </Card>
    </AppScreen>
  );
}
