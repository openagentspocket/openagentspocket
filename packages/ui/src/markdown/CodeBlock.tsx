import { ScrollView, View } from 'react-native';
import { Card } from '../primitives/Card';
import { CopyButton } from '../primitives/CopyButton';
import { Text } from '../primitives/Text';
import { makeStyles } from '../theme/theme';

const useStyles = makeStyles((t) => ({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: t.spacing.sm,
    minHeight: 32,
    borderBottomWidth: t.metrics.hairlineWidth,
    borderBottomColor: t.hairline,
  },
  code: { padding: t.spacing.sm },
  text: { color: t.colors.terminalForeground },
}));

interface CodeBlockProps {
  code: string;
  /** The fence's language tag ("ts"), shown in the bar. */
  language?: string;
  copyLabel?: string;
  copiedLabel?: string;
  testID?: string;
}

/** A fenced code block: monospaced, scrolls sideways, with a language tag and a copy button. */
export function CodeBlock({
  code,
  language,
  copyLabel = 'Copy code',
  copiedLabel,
  testID = 'code-block',
}: CodeBlockProps) {
  const styles = useStyles();
  return (
    <Card level="terminal" padded={false} testID={testID}>
      <View style={styles.bar}>
        <Text variant="label" tone="tertiary">
          {language ?? ''}
        </Text>
        <CopyButton value={code} accessibilityLabel={copyLabel} copiedTitle={copiedLabel} />
      </View>
      <ScrollView horizontal contentContainerStyle={styles.code}>
        <Text variant="mono" selectable style={styles.text}>
          {code}
        </Text>
      </ScrollView>
    </Card>
  );
}
