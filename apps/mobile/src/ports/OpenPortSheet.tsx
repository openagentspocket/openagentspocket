import { manualPort } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Button, Sheet, TextField } from '@openagentspocket/ui';
import { useState } from 'react';

interface OpenPortSheetProps {
  visible: boolean;
  hostName: string;
  onClose: () => void;
  onOpen: (port: number) => void;
}

/** "Open Port…": a port the list does not show, on the Host's own loopback only. */
export function OpenPortSheet({ visible, hostName, onClose, onOpen }: OpenPortSheetProps) {
  const [text, setText] = useState('');
  const port = manualPort(text);
  const submit = () => {
    if (port === null) return;
    setText('');
    onOpen(port);
  };
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('Open Port')}
      detent="fit"
      closeLabel={t('Cancel')}
      footer={
        <Button
          title={t('Open')}
          disabled={port === null}
          onPress={submit}
          testID="open-port-submit"
        />
      }
      testID="open-port-sheet"
    >
      <TextField
        label={t('Port')}
        value={text}
        onChangeText={setText}
        keyboardType="number-pad"
        autoFocus
        hint={t(
          "A port from 1 to 65535 on %@. The preview reaches only the Host's own loopback address.",
          hostName,
        )}
        onSubmitEditing={submit}
        testID="open-port-field"
      />
    </Sheet>
  );
}
