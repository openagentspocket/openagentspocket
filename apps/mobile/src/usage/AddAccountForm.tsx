import { t } from '@openagentspocket/i18n';
import { Button, Text, TextField } from '@openagentspocket/ui';
import { useState } from 'react';

interface Props {
  busy: boolean;
  onAdd: (directory: string) => Promise<boolean>;
}

/** Type a directory and add it as an Account, with the "not officially supported" notice below. */
export function AddAccountForm({ busy, onAdd }: Props) {
  const [directory, setDirectory] = useState('');
  const add = async () => {
    if (await onAdd(directory.trim())) setDirectory('');
  };
  return (
    <>
      <TextField
        label={t('Directory')}
        mono
        value={directory}
        onChangeText={setDirectory}
        autoCapitalize="none"
        autoCorrect={false}
        testID="account-directory"
      />
      <Button
        title={t('Add folder as an Account')}
        kind="secondary"
        disabled={busy || directory.trim() === ''}
        onPress={add}
        testID="account-add"
      />
      <Text variant="footnote" tone="tertiary">
        {t(
          'The plugin asks Claude Code on this computer for your plan limits. Neither the plugin nor Agentico handles your sign-in. This automated use is not officially supported.',
        )}
      </Text>
    </>
  );
}
