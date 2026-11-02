import { View } from 'react-native';
import { CopyButton } from '../primitives/CopyButton';
import { Section } from '../primitives/Section';
import { Text } from '../primitives/Text';
import { makeStyles } from '../theme/theme';

const useStyles = makeStyles((t) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm,
    minHeight: t.metrics.rowMinHeight,
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.xs,
  },
  label: { flexShrink: 0 },
  value: { flex: 1, textAlign: 'right' },
}));

export interface KeyValueRow {
  label: string;
  value: string;
  /** Monospaced value, for ids, paths and hashes. */
  mono?: boolean;
  /** Adds a copy button after the value. */
  copy?: boolean;
  copyLabel?: string;
}

interface KeyValueGroupProps {
  title?: string;
  rows: readonly KeyValueRow[];
  testID?: string;
}

/** A section title above a card of label / value rows: values right aligned in secondary, wrapping when long. */
export function KeyValueGroup({ title, rows, testID = 'key-value-group' }: KeyValueGroupProps) {
  const styles = useStyles();
  return (
    <Section title={title} testID={testID}>
      {rows.map((row) => (
        <View
          key={row.label}
          style={styles.row}
          accessible
          accessibilityLabel={`${row.label}, ${row.value}`}
          testID={`${testID}-row`}
        >
          <Text style={styles.label}>{row.label}</Text>
          <Text
            variant={row.mono ? 'mono' : 'body'}
            tone="secondary"
            selectable
            style={styles.value}
          >
            {row.value}
          </Text>
          {row.copy ? (
            <CopyButton
              value={row.value}
              accessibilityLabel={row.copyLabel ?? `Copy ${row.label}`}
            />
          ) : null}
        </View>
      ))}
    </Section>
  );
}
