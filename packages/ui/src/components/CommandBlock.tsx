import { View } from 'react-native';
import { Card } from '../primitives/Card';
import { CopyButton } from '../primitives/CopyButton';
import { Text } from '../primitives/Text';
import { makeStyles } from '../theme/theme';

const useStyles = makeStyles((t) => ({
  block: { padding: t.spacing.sm },
  line: { flexDirection: 'row', gap: t.spacing.xs },
  prompt: { width: 12 },
  command: { flex: 1 },
  footer: { alignItems: 'flex-end' },
}));

interface CommandBlockProps {
  /** One shell command per line, shown in order and copied together. */
  lines: readonly string[];
  /** The glyph before each line. Default "$". */
  prompt?: string;
  /** The Copy capsule's resting and confirmed titles. */
  copyLabel?: string;
  copiedLabel?: string;
  testID?: string;
}

/** Shell commands on a control-filled block: a prompt glyph per line, selectable text, one Copy capsule for all. */
export function CommandBlock({
  lines,
  prompt = '$',
  copyLabel = 'Copy',
  copiedLabel = 'Copied',
  testID = 'command-block',
}: CommandBlockProps) {
  const styles = useStyles();
  return (
    <Card level="control" style={styles.block} testID={testID}>
      {lines.map((line, index) => (
        <View
          // biome-ignore lint/suspicious/noArrayIndexKey: the same command may repeat
          key={`${index}-${line}`}
          style={styles.line}
        >
          <Text variant="mono" tone="accent" style={styles.prompt} accessibilityElementsHidden>
            {prompt}
          </Text>
          <Text variant="mono" selectable style={styles.command}>
            {line}
          </Text>
        </View>
      ))}
      <View style={styles.footer}>
        <CopyButton
          value={lines.join('\n')}
          title={copyLabel}
          copiedTitle={copiedLabel}
          testID={`${testID}-copy`}
        />
      </View>
    </Card>
  );
}
