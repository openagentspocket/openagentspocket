import { t } from '@openagentspocket/i18n';
import {
  Button,
  Card,
  CommandBlock,
  ListRow,
  Segmented,
  Text,
  useTheme,
} from '@openagentspocket/ui';
import { useState } from 'react';
import { View } from 'react-native';
import { SetupStep } from './SetupStep';
import { guideSteps, pairingCodeStep, type SetupPlatform } from './setupGuideSteps';
import { WhatHappensSheet } from './WhatHappensSheet';

interface EasyPairPanelProps {
  onOpenGuide: () => void;
  onAddManually: () => void;
}

/** Under the camera: pick the machine's platform, copy its command, read what it does; quiet fallbacks below. */
export function EasyPairPanel({ onOpenGuide, onAddManually }: EasyPairPanelProps) {
  const theme = useTheme();
  const [platform, setPlatform] = useState<SetupPlatform>('unix');
  const [explaining, setExplaining] = useState(false);
  const step = pairingCodeStep(platform);
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <Segmented
        options={[
          { value: 'unix', label: t('macOS / Linux') },
          { value: 'windows', label: t('Windows') },
        ]}
        value={platform}
        onChange={setPlatform}
        testID="pairing-platform"
      />
      <Text variant="subheadline" tone="secondary">
        {step.detail}
      </Text>
      <CommandBlock
        lines={step.commands ?? []}
        copyLabel={t('Copy')}
        copiedLabel={t('Copied')}
        testID="pairing-command"
      />
      {platform === 'windows' ? (
        <Card padded={false}>
          {guideSteps('windows').map((guide, index) => (
            <SetupStep key={guide.title} number={index + 1} step={guide} divider={index > 0} />
          ))}
        </Card>
      ) : null}
      <Button
        kind="secondary"
        icon="info"
        title={t('What happens')}
        onPress={() => setExplaining(true)}
        testID="pairing-what-happens"
      />
      <Card padded={false}>
        <ListRow
          icon="book"
          title={t('Setup Guide')}
          chevron
          onPress={onOpenGuide}
          testID="pairing-guide"
        />
      </Card>
      <Button
        kind="text"
        title={t('Add Manually')}
        onPress={onAddManually}
        testID="pairing-manual"
      />
      <WhatHappensSheet
        visible={explaining}
        platform={platform}
        onClose={() => setExplaining(false)}
      />
    </View>
  );
}
