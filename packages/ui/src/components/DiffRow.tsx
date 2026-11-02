import { Pressable, View } from 'react-native';
import { type DiffLabels, defaultDiffLabels } from '../diff/diffLabels';
import { Text } from '../primitives/Text';
import { makeStyles, useTheme } from '../theme/theme';
import {
  type DiffHunk,
  type DiffRowLayout,
  type DiffRowLine,
  LineText,
  lineWash,
  plainText,
  UnifiedLine,
  useDiffStyles,
} from './diffRowParts';

export type { DiffHunk, DiffRowLayout, DiffRowLine, DiffSegment } from './diffRowParts';

const BADGE = 28;

const useStyles = makeStyles((t) => ({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xs,
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.xs,
  },
  kind: {
    width: BADGE,
    height: BADGE,
    borderRadius: t.metrics.chipRadius,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flex: 1 },
  counts: { flexDirection: 'row', gap: t.spacing.xs },
}));

export interface DiffFile {
  /** The kind letter in the badge: M, A, D, R. */
  letter: string;
  tone: 'warning' | 'success' | 'danger' | 'info';
  /** 'Modified - Unstaged'. Translated by the caller. */
  title: string;
  added: number;
  removed: number;
}

interface DiffRowProps {
  file: DiffFile;
  hunks: readonly DiffHunk[];
  layout?: DiffRowLayout;
  /** Long press on a line opens the reference menu. */
  onReference?: (line: DiffRowLine) => void;
  labels?: DiffLabels;
  testID?: string;
}

function spokenLine(line: DiffRowLine, labels: DiffLabels): string {
  const head =
    line.kind === 'add'
      ? labels.added(line.newNumber)
      : line.kind === 'del'
        ? labels.removed(line.oldNumber)
        : labels.unchanged(line.newNumber);
  return `${head}: ${plainText(line)}`;
}

/** Pairs each run of removed lines with the added run after it, row by row. */
function pairLines(lines: readonly DiffRowLine[]): [DiffRowLine?, DiffRowLine?][] {
  const rows: [DiffRowLine?, DiffRowLine?][] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] as DiffRowLine;
    if (line.kind === 'context') {
      rows.push([line, line]);
      i += 1;
      continue;
    }
    const dels: DiffRowLine[] = [];
    const adds: DiffRowLine[] = [];
    while (lines[i]?.kind === 'del') dels.push(lines[i++] as DiffRowLine);
    while (lines[i]?.kind === 'add') adds.push(lines[i++] as DiffRowLine);
    for (let k = 0; k < Math.max(dels.length, adds.length); k++) rows.push([dels[k], adds[k]]);
  }
  return rows;
}

function SplitRow({ pair, labels }: { pair: [DiffRowLine?, DiffRowLine?]; labels: DiffLabels }) {
  const styles = useDiffStyles();
  const theme = useTheme();
  const cell = (line: DiffRowLine | undefined, number: number | undefined) => (
    <View style={[styles.half, line && { backgroundColor: lineWash(line.kind, theme) }]}>
      <Text variant="caption" monospaced tone="tertiary" style={styles.gutter}>
        {number ?? ''}
      </Text>
      {line ? <LineText line={line} /> : <View style={styles.text} />}
    </View>
  );
  const [left, right] = pair;
  const spoken = [left, right]
    .filter((l, i, all): l is DiffRowLine => !!l && all.indexOf(l) === i)
    .map((l) => spokenLine(l, labels))
    .join('. ');
  return (
    <View style={styles.row} accessible accessibilityLabel={spoken} testID="diff-row-split">
      {cell(left, left?.oldNumber)}
      <View style={styles.divider} />
      {cell(right, right?.newNumber)}
    </View>
  );
}

/** Swift's file diff block: file bar, hunk bands with the gap count, numbered lines with word washes. */
export function DiffRow({
  file,
  hunks,
  layout = 'unified',
  onReference,
  labels = defaultDiffLabels,
  testID = 'diff-row',
}: DiffRowProps) {
  const styles = useStyles();
  const diff = useDiffStyles();
  const theme = useTheme();
  const ink = theme.colors[file.tone];
  return (
    <View style={diff.root} testID={testID}>
      <View style={styles.bar} accessible accessibilityLabel={file.title}>
        <View style={[styles.kind, { borderColor: ink }]}>
          <Text variant="subheadline" semibold style={{ color: ink }}>
            {file.letter}
          </Text>
        </View>
        <Text variant="subheadline" style={styles.title} numberOfLines={1}>
          {file.title}
        </Text>
        <View style={styles.counts}>
          <Text variant="subheadline" semibold tone="success">{`+${file.added}`}</Text>
          <Text variant="subheadline" semibold tone="danger">{`-${file.removed}`}</Text>
        </View>
      </View>
      {hunks.map((hunk) => (
        <View key={hunk.header}>
          <Pressable
            style={diff.band}
            onPress={hunk.onExpandGap}
            disabled={!hunk.onExpandGap}
            accessibilityRole={hunk.onExpandGap ? 'button' : 'header'}
            accessibilityLabel={[hunk.header, hunk.gapLabel].filter(Boolean).join(', ')}
            testID="diff-row-hunk"
          >
            <Text
              variant="caption"
              monospaced
              tone="secondary"
              numberOfLines={1}
              style={styles.title}
            >
              {hunk.header}
            </Text>
            {hunk.gapLabel ? (
              <Text variant="caption" tone="secondary">
                {hunk.gapLabel}
              </Text>
            ) : null}
          </Pressable>
          {layout === 'sideBySide'
            ? pairLines(hunk.lines).map((pair, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: diff rows are positional.
                <SplitRow key={i} pair={pair} labels={labels} />
              ))
            : hunk.lines.map((line, i) => (
                <UnifiedLine
                  // biome-ignore lint/suspicious/noArrayIndexKey: diff rows are positional.
                  key={i}
                  line={line}
                  spoken={spokenLine(line, labels)}
                  onReference={onReference}
                />
              ))}
        </View>
      ))}
    </View>
  );
}
