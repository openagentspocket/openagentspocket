import { View } from 'react-native';
import { Icon, type IconName } from '../primitives/Icon';
import { Meter } from '../primitives/Meter';
import { Spinner } from '../primitives/Spinner';
import { Tappable } from '../primitives/Tappable';
import { Text } from '../primitives/Text';
import { airy } from '../theme/metrics';
import { makeStyles, useTheme } from '../theme/theme';

/** How a piece of work stands, as the view says it (the core presentation's statuses). */
export type BackgroundWorkState =
  | 'running'
  | 'unconfirmed'
  | 'quiet'
  | 'completed'
  | 'failed'
  | 'stopped';

export interface BackgroundWorkItem {
  id: string;
  title: string;
  /** A Subagent's type, or the phase a Workflow is in. */
  caption: string;
  /** Workflow names are identifiers: they draw monospaced. */
  monospaced?: boolean;
  state: BackgroundWorkState;
  /** Agents done of those started, drawn as a small bar (while running) and "2/3". */
  fraction?: { done: number; total: number };
  /** "4m 13s", or why there is no time ("Not updating"). */
  meta?: string;
}

export interface BackgroundWorkSummaryLine {
  state: BackgroundWorkState;
  text: string;
}

export interface BackgroundWorkLabels {
  /** "+1 more" */
  more: (count: number) => string;
  /** The strip's own name, and what tapping it does. */
  name: string;
  hint: string;
}

export const defaultBackgroundWorkLabels: BackgroundWorkLabels = {
  more: (count) => `+${count} more`,
  name: 'Background work',
  hint: 'Shows all background work.',
};

const GLYPHS: Partial<Record<BackgroundWorkState, IconName>> = {
  unconfirmed: 'clock',
  quiet: 'clock',
  completed: 'check',
  failed: 'errorCircle',
  stopped: 'stop',
};

/** Width of the leading glyph column. */
const LEAD = 18;

const useStyles = makeStyles((t) => ({
  // Rounder than a banner, less than the composer card below it.
  card: {
    paddingHorizontal: t.spacing.sm,
    paddingVertical: t.spacing.xxs,
    borderRadius: 18,
    backgroundColor: t.colors.surfaceRaised,
    borderWidth: t.metrics.hairlineWidth,
    borderColor: t.hairline,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xs,
    paddingHorizontal: t.spacing.sm,
    paddingVertical: t.spacing.xs,
    borderRadius: 18,
    backgroundColor: t.colors.surfaceRaised,
    borderWidth: t.metrics.hairlineWidth,
    borderColor: t.hairline,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xs,
    paddingVertical: t.spacing.xxs,
  },
  lead: { width: LEAD, alignItems: 'center' },
  titles: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: t.spacing.xxs,
    overflow: 'hidden',
  },
  title: { flexShrink: 1 },
  fixed: { flexShrink: 0 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xxs, flexShrink: 0 },
  bar: { width: 36 },
  more: { paddingLeft: LEAD + airy.stack, paddingVertical: t.spacing.xxs },
  fill: { flex: 1 },
}));

/** A row's state as tool rows draw theirs; the label says it in words. */
export function BackgroundWorkGlyph({ state }: { state: BackgroundWorkState }) {
  const styles = useStyles();
  const theme = useTheme();
  const icon = GLYPHS[state];
  return (
    <View style={styles.lead} accessibilityElementsHidden importantForAccessibility="no">
      {icon === undefined ? (
        <Spinner size="small" testID="work-spinner" />
      ) : (
        <Icon
          name={icon}
          size={14}
          color={state === 'failed' ? 'danger' : 'textSecondary'}
          testID={`work-glyph-${state}`}
        />
      )}
    </View>
  );
}

function WorkRow({ item, onPress }: { item: BackgroundWorkItem; onPress: () => void }) {
  const styles = useStyles();
  const muted = item.state === 'completed' || item.state === 'stopped';
  return (
    <Tappable
      style={styles.row}
      onPress={onPress}
      accessibilityRole="button"
      testID={`work-row-${item.id}`}
    >
      <BackgroundWorkGlyph state={item.state} />
      <View style={styles.titles}>
        <Text
          variant="subheadline"
          tone={muted ? 'secondary' : 'primary'}
          monospaced={item.monospaced}
          numberOfLines={1}
          style={styles.title}
        >
          {item.title}
        </Text>
        <Text variant="caption" tone="secondary" numberOfLines={1} style={styles.fixed}>
          {item.caption}
        </Text>
      </View>
      <View style={styles.meta}>
        {item.fraction ? (
          <>
            {item.state === 'running' ? (
              <View style={styles.bar}>
                <Meter
                  value={
                    Math.min(item.fraction.done, item.fraction.total) /
                    Math.max(1, item.fraction.total)
                  }
                  accessibilityLabel={item.title}
                />
              </View>
            ) : null}
            <Text variant="caption" tone="secondary" tabularNums>
              {`${item.fraction.done}/${item.fraction.total}`}
            </Text>
          </>
        ) : null}
        {item.meta ? (
          <Text variant="caption" tone="secondary" tabularNums numberOfLines={1}>
            {item.meta}
          </Text>
        ) : null}
      </View>
    </Tappable>
  );
}

interface BackgroundWorkStripProps {
  /** The rows to show (the first three of the list), running first. */
  items: readonly BackgroundWorkItem[];
  /** How many more the list holds ("+N more"). */
  overflow?: number;
  /** One line instead of the rows: the Composer is open or a Blocked card stands in its place. */
  summary?: BackgroundWorkSummaryLine;
  /** Opens the sheet at a row's id, or at no row. */
  onOpen: (id: string | null) => void;
  labels?: Partial<BackgroundWorkLabels>;
  testID?: string;
}

/**
 * Chat's Background Work over the Composer (Swift ChatBackgroundWorkStrip): up to three rows, then
 * "+N more", or one summary line; every tap opens the sheet that lists it all. Empty with nothing to list.
 */
export function BackgroundWorkStrip({
  items,
  overflow = 0,
  summary,
  onOpen,
  labels,
  testID = 'background-work-strip',
}: BackgroundWorkStripProps) {
  const styles = useStyles();
  const text = { ...defaultBackgroundWorkLabels, ...labels };
  if (items.length === 0 && !summary) return null;
  if (summary) {
    return (
      <Tappable
        style={styles.summary}
        onPress={() => onOpen(null)}
        accessibilityRole="button"
        accessibilityLabel={text.name}
        accessibilityValue={{ text: summary.text }}
        accessibilityHint={text.hint}
        testID={`${testID}-summary`}
      >
        <BackgroundWorkGlyph state={summary.state} />
        <Text variant="footnote" tone="secondary" numberOfLines={1} tabularNums style={styles.fill}>
          {summary.text}
        </Text>
        <Icon name="chevronRight" size={12} color="textTertiary" />
      </Tappable>
    );
  }
  return (
    <View style={styles.card} accessibilityLabel={text.name} testID={testID}>
      {items.map((item) => (
        <WorkRow key={item.id} item={item} onPress={() => onOpen(item.id)} />
      ))}
      {overflow > 0 ? (
        <Tappable
          onPress={() => onOpen(null)}
          accessibilityRole="button"
          accessibilityLabel={text.more(overflow)}
          accessibilityHint={text.hint}
          style={styles.more}
          testID="work-more"
        >
          <Text variant="footnote" tone="accent" semibold>
            {text.more(overflow)}
          </Text>
        </Tappable>
      ) : null}
    </View>
  );
}
