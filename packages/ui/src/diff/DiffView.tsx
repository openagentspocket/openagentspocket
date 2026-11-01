import { useMemo } from 'react';
import { View } from 'react-native';
import { Text } from '../primitives/Text';
import { makeStyles, type Theme, useTheme } from '../theme/theme';
import { type DiffLine, parseUnifiedDiff, toSideBySide } from './parseUnifiedDiff';

export type DiffLayout = 'unified' | 'split';

const useStyles = makeStyles((t) => ({
  root: {
    borderRadius: t.metrics.cardRadius,
    borderWidth: t.metrics.hairlineWidth,
    borderColor: t.hairline,
    backgroundColor: t.colors.surface,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row' },
  half: { flex: 1, flexDirection: 'row' },
  divider: { width: t.metrics.hairlineWidth, backgroundColor: t.hairline },
  gutter: { width: 36, textAlign: 'right', paddingRight: t.spacing.xxs },
  sign: { width: 14, textAlign: 'center' },
  text: { flex: 1, paddingRight: t.spacing.xs },
  small: { fontSize: 12, lineHeight: 17 },
}));

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
      <Text variant="mono" tone="tertiary" style={[styles.gutter, styles.small]}>
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
  testID?: string;
}

/** A diff in the theme's success/danger washes, unified or side by side. Lines wrap. */
export function DiffView({ diff, layout = 'unified', testID = 'diff-view' }: DiffViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const lines = useMemo(() => (typeof diff === 'string' ? parseUnifiedDiff(diff) : diff), [diff]);
  if (layout === 'split') {
    return (
      <View style={styles.root} testID={testID}>
        {toSideBySide(lines).map((row, index) =>
          row.left && !row.right && (row.left.kind === 'hunk' || row.left.kind === 'meta') ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: diff rows are positional.
            <View key={index} style={styles.row} testID={`diff-line-${row.left.kind}`}>
              <Cell line={row.left} styles={styles} theme={theme} />
            </View>
          ) : (
            // biome-ignore lint/suspicious/noArrayIndexKey: diff rows are positional.
            <View key={index} style={styles.row} testID="diff-split-row">
              <Cell line={row.left} styles={styles} theme={theme} />
              <View style={styles.divider} />
              <Cell line={row.right} styles={styles} theme={theme} />
            </View>
          ),
        )}
      </View>
    );
  }
  return (
    <View style={styles.root} testID={testID}>
      {lines.map((line, index) => (
        <View
          // biome-ignore lint/suspicious/noArrayIndexKey: diff lines are positional.
          key={index}
          style={[styles.row, { backgroundColor: lineFill(line.kind, theme) }]}
          testID={`diff-line-${line.kind}`}
        >
          <Text variant="mono" tone="tertiary" style={[styles.gutter, styles.small]}>
            {line.oldNumber ?? ''}
          </Text>
          <Text variant="mono" tone="tertiary" style={[styles.gutter, styles.small]}>
            {line.newNumber ?? ''}
          </Text>
          <Text variant="mono" tone="secondary" style={[styles.sign, styles.small]}>
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
    </View>
  );
}
