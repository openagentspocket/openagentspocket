import { useState } from 'react';
import { View } from 'react-native';
import { TextField } from '../form/TextField';
import { Button } from '../primitives/Button';
import { makeStyles } from '../theme/theme';
import type { QRScannerLabels } from './qrLabels';

const useStyles = makeStyles((t) => ({ field: { gap: t.spacing.xs } }));

interface QRPasteFieldProps {
  labels: QRScannerLabels;
  onCode: (text: string) => void;
}

/** The no-camera path: type or paste the code the QR encodes. */
export function QRPasteField({ labels, onCode }: QRPasteFieldProps) {
  const styles = useStyles();
  const [text, setText] = useState('');
  const empty = text.trim().length === 0;
  const submit = () => {
    if (empty) return;
    const code = text.trim();
    setText('');
    onCode(code);
  };
  return (
    <View style={styles.field}>
      <TextField
        label={labels.pasteField}
        placeholder={labels.pastePlaceholder}
        value={text}
        onChangeText={setText}
        onSubmitEditing={submit}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="go"
        mono
        testID="qr-paste-field"
      />
      <Button
        title={labels.pasteSubmit}
        kind="secondary"
        disabled={empty}
        onPress={submit}
        testID="qr-paste-submit"
      />
    </View>
  );
}
