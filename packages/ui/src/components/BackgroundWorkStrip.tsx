import { View } from 'react-native';
import { Icon, type IconName } from '../primitives/Icon';
import { Spinner } from '../primitives/Spinner';
import { Tappable } from '../primitives/Tappable';
import { Text } from '../primitives/Text';
import { rounded } from '../theme/corners';
import { makeStyles } from '../theme/theme';

/** How a piece of work stands, as the view says it (the core presentation's statuses). */
export type BackgroundWorkState =
  | 'running'
  | 'unconfirmed'
  | 'quiet'
  | 'completed'
  | 'failed'
  | 'stopped';

/** The status line's state: a piece of work's, or the Agent waiting on the user. */
export type StatusLineState = BackgroundWorkState | 'waiting';

export interface BackgroundWorkSummaryLine {
  state: StatusLineState;
  /** "Working for 1m 56s · Thinking · 2 running · 1 done". */
  text: string;
  /** The same, as VoiceOver reads it; the text when omitted. */
  accessibilityValue?: string;
}

export interface BackgroundWorkLabels {
  /** The line's own name, and what tapping it does. */
  name: string;
  hint: string;
}

export const defaultBackgroundWorkLabels: BackgroundWorkLabels = {
  name: 'Background work',
  hint: 'Shows all background work.',
};

const GLYPHS: Partial<Record<StatusLineState, IconName>> = {
  unconfirmed: 'clock',
  quiet: 'clock',
  completed: 'check',
  failed: 'errorCircle',
  stopped: 'stop',
  waiting: 'hand',
};

/** Width of the leading glyph column. */
const LEAD = 18;

const useStyles = makeStyles((t) => ({
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xs,
    paddingHorizontal: t.spacing.sm,
    paddingVertical: t.spacing.xs,
    ...rounded(t.radius.card),
    backgroundColor: t.colors.surfaceRaised,
    borderWidth: t.metrics.hairlineWidth,
    borderColor: t.hairline,
  },
  lead: { width: LEAD, alignItems: 'center' },
  fill: { flex: 1 },
}));

/** A row's state as tool rows draw theirs; the label says it in words. */
export function BackgroundWorkGlyph({ state }: { state: StatusLineState }) {
  const styles = useStyles();
  const icon = GLYPHS[state];
  return (
    <View style={styles.lead} accessibilityElementsHidden importantForAccessibility="no">
      {icon === undefined ? (
        <Spinner size="small" testID="work-spinner" />
      ) : (
        <Icon
          name={icon}
          size={14}
          color={state === 'failed' ? 'danger' : state === 'waiting' ? 'warning' : 'textSecondary'}
          testID={`work-glyph-${state}`}
        />
      )}
    </View>
  );
}

interface BackgroundWorkStripProps {
  /** The one line; nothing draws without it. */
  line: BackgroundWorkSummaryLine | null;
  /** Opens the sheet that lists all the work. */
  onOpen: () => void;
  labels?: Partial<BackgroundWorkLabels>;
  testID?: string;
}

/**
 * Chat's status line over the Composer: how long the turn has worked, what the Agent does, and the
 * Background Work as counts, finished work included. A tap opens the sheet that lists it all.
 */
export function BackgroundWorkStrip({
  line,
  onOpen,
  labels,
  testID = 'background-work-strip',
}: BackgroundWorkStripProps) {
  const styles = useStyles();
  const text = { ...defaultBackgroundWorkLabels, ...labels };
  if (line === null) return null;
  return (
    <Tappable
      style={styles.line}
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={text.name}
      accessibilityValue={{ text: line.accessibilityValue ?? line.text }}
      accessibilityHint={text.hint}
      testID={`${testID}-summary`}
    >
      <BackgroundWorkGlyph state={line.state} />
      <Text variant="footnote" tone="secondary" numberOfLines={1} tabularNums style={styles.fill}>
        {line.text}
      </Text>
      <Icon name="chevronRight" size={12} color="textTertiary" />
    </Tappable>
  );
}
