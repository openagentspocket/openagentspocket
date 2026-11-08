import { View } from 'react-native';
import { CopyButton } from '../primitives/CopyButton';
import { Icon } from '../primitives/Icon';
import { Section } from '../primitives/Section';
import { Tappable } from '../primitives/Tappable';
import { Text } from '../primitives/Text';
import { airy } from '../theme/metrics';
import { makeStyles } from '../theme/theme';

const useStyles = makeStyles((t) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm,
    minHeight: t.metrics.minTapSize,
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.xs,
  },
  rowCompact: { minHeight: 36, paddingVertical: airy.line },
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
  /** Makes the row a button with a disclosure chevron (the plugin row opens its notice). */
  onPress?: () => void;
  testID?: string;
}

interface KeyValueGroupProps {
  title?: string;
  /** Tighter rows (a sheet that must fit above the fold). */
  compact?: boolean;
  rows: readonly KeyValueRow[];
  testID?: string;
}

/** A section title above a card of label / value rows: values right aligned in secondary, wrapping when long. */
export function KeyValueGroup({
  title,
  rows,
  compact = false,
  testID = 'key-value-group',
}: KeyValueGroupProps) {
  const styles = useStyles();
  return (
    <Section title={title} testID={testID}>
      {rows.map((row) => {
        const Row = row.onPress ? Tappable : View;
        return (
          <Row
            key={row.label}
            style={[styles.row, compact && styles.rowCompact]}
            accessible
            accessibilityRole={row.onPress ? 'button' : undefined}
            accessibilityLabel={`${row.label}, ${row.value}`}
            onPress={row.onPress}
            testID={row.testID ?? `${testID}-row`}
          >
            <Text variant={compact ? 'subheadline' : 'body'} style={styles.label}>
              {row.label}
            </Text>
            <Text
              variant={row.mono ? 'mono' : compact ? 'subheadline' : 'body'}
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
            {row.onPress ? <Icon name="chevronRight" size={13} color="textTertiary" /> : null}
          </Row>
        );
      })}
    </Section>
  );
}
