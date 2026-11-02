import { ActivityIndicator, Pressable, View } from 'react-native';
import { Icon } from '../primitives/Icon';
import { Meter } from '../primitives/Meter';
import { Text } from '../primitives/Text';
import { makeStyles, useTheme } from '../theme/theme';

export interface BackgroundWorkItem {
  id: string;
  title: string;
  /** "Explore", "Audit", "general-purpose". */
  kind: string;
  state: 'running' | 'done';
  /** Steps finished and total, drawn as a small bar and "2/3". */
  progress?: { done: number; total: number };
  /** "4m 13s". */
  elapsed: string;
  /** Titles that are identifiers (agent names) draw monospaced. */
  monospaced?: boolean;
}

export interface BackgroundWorkLabels {
  /** "1 running" */
  running: (count: number) => string;
  /** "+1 more" */
  more: (count: number) => string;
  open: string;
}

export const defaultBackgroundWorkLabels: BackgroundWorkLabels = {
  running: (count) => `${count} running`,
  more: (count) => `+${count} more`,
  open: 'Background work',
};

/** Rows the expanded card shows before "+N more". */
export const BACKGROUND_WORK_ROWS = 3;

const useStyles = makeStyles((t) => ({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xs,
    minHeight: t.metrics.minTapSize,
    paddingHorizontal: t.spacing.sm,
    borderRadius: 14,
    backgroundColor: t.colors.surfaceRaised,
    borderWidth: t.metrics.hairlineWidth,
    borderColor: t.hairline,
  },
  pillText: { flex: 1 },
  card: {
    gap: t.spacing.sm,
    padding: t.spacing.sm,
    borderRadius: 14,
    backgroundColor: t.colors.surfaceRaised,
    borderWidth: t.metrics.hairlineWidth,
    borderColor: t.hairline,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs },
  fixed: { flexShrink: 0 },
  lead: { width: 20, alignItems: 'center' },
  title: { flexShrink: 1 },
  spacer: { flex: 1 },
  meter: { width: 40 },
}));

interface BackgroundWorkStripProps {
  items: readonly BackgroundWorkItem[];
  /** Expanded: a card with the first rows. Collapsed: the one-line pill. */
  expanded?: boolean;
  onOpen: () => void;
  labels?: Partial<BackgroundWorkLabels>;
  testID?: string;
}

function Lead({ state }: { state: BackgroundWorkItem['state'] }) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View style={styles.lead}>
      {state === 'running' ? (
        <ActivityIndicator size="small" color={theme.colors.accent} testID="work-spinner" />
      ) : (
        <View testID="work-check">
          <Icon name="check" size={15} />
        </View>
      )}
    </View>
  );
}

function WorkRow({ item }: { item: BackgroundWorkItem }) {
  const styles = useStyles();
  const finished = item.state === 'done';
  const tone = finished ? 'secondary' : 'primary';
  return (
    <View style={styles.row} testID={`work-row-${item.id}`}>
      <Lead state={item.state} />
      <Text
        variant="subheadline"
        tone={tone}
        monospaced={item.monospaced}
        semibold={!finished}
        numberOfLines={1}
        style={styles.title}
      >
        {item.title}
      </Text>
      <Text variant="caption" tone="secondary" numberOfLines={1} style={styles.fixed}>
        {item.kind}
      </Text>
      <View style={styles.spacer} />
      {item.progress && !finished ? (
        <>
          <View style={styles.meter}>
            <Meter
              value={item.progress.done / Math.max(1, item.progress.total)}
              accessibilityLabel={item.title}
            />
          </View>
          <Text variant="footnote" tone="secondary" tabularNums>
            {`${item.progress.done}/${item.progress.total}`}
          </Text>
        </>
      ) : null}
      <Text variant="footnote" tone="secondary" tabularNums numberOfLines={1} style={styles.fixed}>
        {item.elapsed}
      </Text>
    </View>
  );
}

/**
 * The background work strip above the composer: a pill ("1 running · title") that opens the
 * background work sheet, or an expanded card with up to three rows and "+N more".
 */
export function BackgroundWorkStrip({
  items,
  expanded = false,
  onOpen,
  labels,
  testID = 'background-work-strip',
}: BackgroundWorkStripProps) {
  const styles = useStyles();
  const theme = useTheme();
  const text = { ...defaultBackgroundWorkLabels, ...labels };
  if (items.length === 0) return null;
  const running = items.filter((item) => item.state === 'running');
  const first = running[0] ?? items[0];
  const summary = `${text.running(running.length)} · ${first?.title ?? ''}`;
  if (!expanded) {
    return (
      <Pressable
        style={styles.pill}
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={summary}
        accessibilityHint={text.open}
        testID={testID}
      >
        <ActivityIndicator size="small" color={theme.colors.accent} />
        <Text variant="subheadline" numberOfLines={1} style={styles.pillText}>
          {summary}
        </Text>
        <Icon name="chevronRight" size={14} color="textTertiary" />
      </Pressable>
    );
  }
  const shown = items.slice(0, BACKGROUND_WORK_ROWS);
  const hidden = items.length - shown.length;
  return (
    <Pressable
      style={styles.card}
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={text.open}
      testID={testID}
    >
      {shown.map((item) => (
        <WorkRow key={item.id} item={item} />
      ))}
      {hidden > 0 ? (
        <Text variant="subheadline" tone="accent" semibold testID="work-more">
          {text.more(hidden)}
        </Text>
      ) : null}
    </Pressable>
  );
}
