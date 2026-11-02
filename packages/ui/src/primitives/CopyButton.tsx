import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { makeStyles } from '../theme/theme';
import { Button } from './Button';
import { copyToClipboard } from './clipboard';
import { Text } from './Text';

/** How long a copy control shows that the value was copied. */
export const COPY_CONFIRMATION_MS = 1500;

interface CopyButtonProps {
  value: string;
  /** What screen readers hear, such as "Copy pane id". */
  accessibilityLabel?: string;
  /** A resting title ("Copy Command") makes it a labeled button that flips to `copiedTitle`. */
  title?: string;
  copiedTitle?: string;
  testID?: string;
}

/** Copies `value`, then shows a checkmark (and `copiedTitle`) for a moment. */
export function CopyButton({
  value,
  accessibilityLabel = 'Copy',
  title,
  copiedTitle = 'Copied',
  testID = 'copy-button',
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPY_CONFIRMATION_MS);
    return () => clearTimeout(timer);
  }, [copied]);
  const onPress = () => {
    void copyToClipboard(value, copiedTitle).then((ok) => setCopied(ok));
  };
  const icon = copied ? 'check' : 'copy';
  if (title !== undefined) {
    return (
      <Button
        kind="text"
        size="small"
        icon={icon}
        title={copied ? copiedTitle : title}
        onPress={onPress}
        testID={testID}
      />
    );
  }
  return (
    <Button
      kind="text"
      size="small"
      icon={icon}
      accessibilityLabel={copied ? copiedTitle : accessibilityLabel}
      onPress={onPress}
      testID={testID}
    />
  );
}

const useStyles = makeStyles((t) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xs,
    paddingVertical: t.spacing.xxs,
  },
  value: { flex: 1, textAlign: 'right' },
}));

interface CopyableValueRowProps {
  label: string;
  value: string;
  /** False for a value not worth pasting elsewhere (a name, not an id). */
  copyable?: boolean;
  /** Screen-reader label of the copy button; defaults to "Copy <label>". */
  copyLabel?: string;
}

/** "Pane id   wB:p1": a label, its selectable monospaced value, and a copy button. */
export function CopyableValueRow({
  label,
  value,
  copyable = true,
  copyLabel,
}: CopyableValueRowProps) {
  const styles = useStyles();
  return (
    <View style={styles.row}>
      <Text variant="caption" tone="secondary">
        {label}
      </Text>
      <Text variant="mono" selectable style={styles.value}>
        {value}
      </Text>
      {copyable ? (
        <CopyButton value={value} accessibilityLabel={copyLabel ?? `Copy ${label}`} />
      ) : null}
    </View>
  );
}
