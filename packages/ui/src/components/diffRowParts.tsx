import { Tappable } from '../primitives/Tappable';
import { Text } from '../primitives/Text';
import { makeStyles, type Theme, useTheme } from '../theme/theme';

export interface DiffSegment {
  text: string;
  /** A changed word: a stronger wash under it. */
  changed?: boolean;
}

export interface DiffRowLine {
  kind: 'add' | 'del' | 'context';
  oldNumber?: number;
  newNumber?: number;
  /** The text as runs, to highlight changed words; `text` is the plain fallback. */
  segments?: readonly DiffSegment[];
  text?: string;
}

export interface DiffHunk {
  /** '@@ -4,3 +4,3 @@ struct AttachChrome'. */
  header: string;
  /** 'N unchanged lines' at the right of the band; tap expands the gap. */
  gapLabel?: string;
  onExpandGap?: () => void;
  lines: readonly DiffRowLine[];
}

export type DiffRowLayout = 'unified' | 'sideBySide';

const GUTTER = 36;
const SIGN = 16;

export const useDiffStyles = makeStyles((t) => ({
  root: { backgroundColor: t.colors.canvas },
  band: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: t.spacing.xs,
    backgroundColor: t.colors.surface,
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.xxs,
    minHeight: t.metrics.minTapSize,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  half: { flex: 1, flexDirection: 'row' },
  gutter: { width: GUTTER, textAlign: 'right', paddingRight: t.spacing.xxs },
  sign: { width: SIGN, textAlign: 'center' },
  text: { flex: 1, paddingRight: t.spacing.xs },
  divider: { width: t.metrics.hairlineWidth, backgroundColor: t.hairline },
}));

export function lineWash(kind: DiffRowLine['kind'], theme: Theme): string | undefined {
  if (kind === 'add') return theme.wash(theme.colors.success);
  if (kind === 'del') return theme.wash(theme.colors.danger);
  return undefined;
}

const SIGNS = { add: '+', del: '-', context: '' } as const;

export function LineText({ line }: { line: DiffRowLine }) {
  const styles = useDiffStyles();
  const theme = useTheme();
  const strong = line.kind === 'add' ? theme.colors.success : theme.colors.danger;
  const runs = line.segments ?? [{ text: line.text ?? '' }];
  return (
    <Text variant="mono" style={styles.text}>
      {runs.map((run, i) => (
        <Text
          // biome-ignore lint/suspicious/noArrayIndexKey: runs are positional.
          key={i}
          variant="mono"
          style={run.changed ? { backgroundColor: theme.wash(strong) } : undefined}
        >
          {run.text}
        </Text>
      ))}
    </Text>
  );
}

export function plainText(line: DiffRowLine): string {
  return line.segments ? line.segments.map((s) => s.text).join('') : (line.text ?? '');
}

interface UnifiedProps {
  line: DiffRowLine;
  spoken: string;
  onReference?: (line: DiffRowLine) => void;
}

export function UnifiedLine({ line, spoken, onReference }: UnifiedProps) {
  const styles = useDiffStyles();
  const theme = useTheme();
  const sign = SIGNS[line.kind];
  const signInk = line.kind === 'add' ? 'success' : line.kind === 'del' ? 'danger' : 'tertiary';
  return (
    <Tappable
      style={[styles.row, { backgroundColor: lineWash(line.kind, theme) }]}
      onLongPress={onReference ? () => onReference(line) : undefined}
      accessibilityLabel={spoken}
      testID={`diff-row-${line.kind}`}
    >
      <Text variant="caption" monospaced tone="tertiary" style={styles.gutter}>
        {line.oldNumber ?? ''}
      </Text>
      <Text variant="caption" monospaced tone="tertiary" style={styles.gutter}>
        {line.newNumber ?? ''}
      </Text>
      <Text variant="mono" tone={signInk} style={styles.sign}>
        {sign}
      </Text>
      <LineText line={line} />
    </Tappable>
  );
}
