import { t } from '@openagentspocket/i18n';
import { Button, Card, CommandBlock, ListRow, Text, useTheme } from '@openagentspocket/ui';
import { useState } from 'react';
import { View } from 'react-native';
import { pairingCodeStep } from './setupGuideSteps';
import { WhatHappensSheet } from './WhatHappensSheet';

interface EasyPairPanelProps {
  onOpenGuide: () => void;
  onAddManually: () => void;
}

/** Under the camera: copy the computer's command, read what it does; quiet fallbacks below. */
export function EasyPairPanel({ onOpenGuide, onAddManually }: EasyPairPanelProps) {
  const theme = useTheme();
  const [explaining, setExplaining] = useState(false);
  const step = pairingCodeStep();
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <Text variant="subheadline" tone="secondary">
        {step.detail}
      </Text>
      <CommandBlock
        lines={step.commands ?? []}
        copyLabel={t('Copy')}
        copiedLabel={t('Copied')}
        testID="pairing-command"
      />
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
      <WhatHappensSheet visible={explaining} onClose={() => setExplaining(false)} />
    </View>
  );
}
