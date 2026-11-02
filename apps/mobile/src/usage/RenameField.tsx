import { t } from '@openagentspocket/i18n';
import { Button, makeStyles, TextField } from '@openagentspocket/ui';
import { useState } from 'react';
import { View } from 'react-native';

const useStyles = makeStyles((th) => ({
  box: { padding: th.spacing.md, gap: th.spacing.xs },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: th.spacing.xs },
}));

interface Props {
  initial: string;
  busy: boolean;
  onSave: (name: string) => void;
  onCancel: () => void;
}

/** An Account row turned into a name field with Cancel and Save. */
export function RenameField({ initial, busy, onSave, onCancel }: Props) {
  const styles = useStyles();
  const [name, setName] = useState(initial);
  return (
    <View style={styles.box}>
      <TextField
        label={t('Rename Account')}
        value={name}
        onChangeText={setName}
        autoFocus
        testID="account-rename-field"
      />
      <View style={styles.buttons}>
        <Button title={t('Cancel')} kind="text" size="small" onPress={onCancel} />
        <Button
          title={t('Save')}
          size="small"
          disabled={busy}
          onPress={() => onSave(name)}
          testID="account-rename-save"
        />
      </View>
    </View>
  );
}
