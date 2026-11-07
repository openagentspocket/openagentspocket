import { useMemo } from 'react';
import { View } from 'react-native';
import { Card } from '../primitives/Card';
import { Text } from '../primitives/Text';
import { makeStyles, type Theme, useTheme } from '../theme/theme';
import {
  type DiffLabels,
  type DiffLineHead,
  defaultDiffLabels,
  diffLineLabel,
  diffRowLabel,
} from './diffLabels';
import { type DiffLine, parseUnifiedDiff, toSideBySide } from './parseUnifiedDiff';

export type DiffLayout = 'unified' | 'split';

const useStyles = makeStyles((t) => ({
  row: { flexDirection: 'row' },
  half: { flex: 1, flexDirection: 'row' },
  divider: { width: t.metrics.hairlineWidth, backgroundColor: t.hairline },
  gutter: { width: 36, textAlign: 'right', paddingRight: t.spacing.xxs },
  sign: { width: 14, textAlign: 'center' },
  text: { flex: 1, paddingRight: t.spacing.xs },
  small: { fontSize: 12, lineHeight: 17 },
}));

/** Gutters, signs and dividers: the row's label already says them. */
const HIDDEN = { accessibilityElementsHidden: true, importantForAccessibility: 'no' } as const;

const SIGN: Record<DiffLine['kind'], string> = {
  add: '+',
  del: '-',
  context: ' ',
  hunk: '',
  meta: '',
};

function lineFill(kind: DiffLine['kind'], theme: Theme): string | undefined {
  if (kind === 'add') return theme.wash(theme.colors.success);
  if (kind === 'del') return theme.wash(theme.colors.danger);
  if (kind === 'hunk') return theme.colors.accentContainer;
  return undefined;
}

function Cell({
  line,
  styles,
  theme,
}: {
  line?: DiffLine;
  styles: ReturnType<typeof useStyles>;
  theme: Theme;
}) {
  if (!line) return <View style={styles.half} />;
  const number = line.kind === 'add' ? line.newNumber : line.oldNumber;
  return (
    <View style={[styles.half, { backgroundColor: lineFill(line.kind, theme) }]}>
      <Text variant="mono" tone="tertiary" style={[styles.gutter, styles.small]} {...HIDDEN}>
        {number ?? ''}
      </Text>
      <Text variant="mono" style={[styles.text, styles.small]}>
        {line.text}
      </Text>
    </View>
  );
}

interface DiffViewProps {
  /** Unified diff text (`git diff` output) or already-parsed lines. */
  diff: string | readonly DiffLine[];
  /** unified: one column with +/-; split: old on the left, new on the right. */
  layout?: DiffLayout;
  /** Spoken heads per line ("Added, line 12"); English by default, pass translations. */
  addedLabel?: DiffLineHead;
  removedLabel?: DiffLineHead;
  unchangedLabel?: DiffLineHead;
  testID?: string;
}

/**
 * A diff in the theme's success/danger washes, unified or side by side. Lines wrap.
 * Each row is one screen-reader element ("Added, line 12: text"); a split row reads
 * its removed line, then its added one; a hunk band reads its header.
 */
export function DiffView({
  diff,
  layout = 'unified',
  addedLabel = defaultDiffLabels.added,
  removedLabel = defaultDiffLabels.removed,
  unchangedLabel = defaultDiffLabels.unchanged,
  testID = 'diff-view',
}: DiffViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const lines = useMemo(() => (typeof diff === 'string' ? parseUnifiedDiff(diff) : diff), [diff]);
  const labels: DiffLabels = {
    added: addedLabel,
    removed: removedLabel,
    unchanged: unchangedLabel,
  };
  if (layout === 'split') {
    return (
      <Card padded={false} testID={testID}>
        {toSideBySide(lines).map((row, index) =>
          row.left && !row.right && (row.left.kind === 'hunk' || row.left.kind === 'meta') ? (
            <View
              // biome-ignore lint/suspicious/noArrayIndexKey: diff rows are positional.
              key={index}
              style={styles.row}
              accessible
              accessibilityLabel={diffRowLabel(row, labels)}
              testID={`diff-line-${row.left.kind}`}
            >
              <Cell line={row.left} styles={styles} theme={theme} />
            </View>
          ) : (
            <View
              // biome-ignore lint/suspicious/noArrayIndexKey: diff rows are positional.
              key={index}
              style={styles.row}
              accessible
              accessibilityLabel={diffRowLabel(row, labels)}
              testID="diff-split-row"
            >
              <Cell line={row.left} styles={styles} theme={theme} />
              <View style={styles.divider} {...HIDDEN} />
              <Cell line={row.right} styles={styles} theme={theme} />
            </View>
          ),
        )}
      </Card>
    );
  }
  return (
    <Card padded={false} testID={testID}>
      {lines.map((line, index) => (
        <View
          // biome-ignore lint/suspicious/noArrayIndexKey: diff lines are positional.
          key={index}
          style={[styles.row, { backgroundColor: lineFill(line.kind, theme) }]}
          accessible
          accessibilityLabel={diffLineLabel(line, labels)}
          testID={`diff-line-${line.kind}`}
        >
          <Text variant="mono" tone="tertiary" style={[styles.gutter, styles.small]} {...HIDDEN}>
            {line.oldNumber ?? ''}
          </Text>
          <Text variant="mono" tone="tertiary" style={[styles.gutter, styles.small]} {...HIDDEN}>
            {line.newNumber ?? ''}
          </Text>
          <Text variant="mono" tone="secondary" style={[styles.sign, styles.small]} {...HIDDEN}>
            {SIGN[line.kind]}
          </Text>
          <Text
            variant="mono"
            tone={line.kind === 'hunk' || line.kind === 'meta' ? 'secondary' : 'primary'}
            style={[styles.text, styles.small]}
          >
            {line.text}
          </Text>
        </View>
      ))}
    </Card>
  );
}
