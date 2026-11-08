import { View } from 'react-native';
import { Icon } from '../primitives/Icon';
import { Meter } from '../primitives/Meter';
import { Section } from '../primitives/Section';
import { Tappable } from '../primitives/Tappable';
import { Text } from '../primitives/Text';
import { airy } from '../theme/metrics';
import { makeStyles } from '../theme/theme';
import { BackgroundWorkGlyph, type BackgroundWorkState } from './BackgroundWorkStrip';

export interface BackgroundWorkAgentItem {
  id: string;
  state: BackgroundWorkState;
  /** The label its program gave it ("Agent 3" when it gave none). */
  label: string;
  phase?: string;
}

export interface BackgroundWorkDetailItem {
  id: string;
  title: string;
  monospaced?: boolean;
  state: BackgroundWorkState;
  /** "2m 18s". */
  time?: string;
  /** Why it shows no time ("No updates since 1:16 PM"). */
  note?: string;
  /** What a Workflow says it does, or a Subagent's type. */
  body: string;
  fraction?: { done: number; total: number };
  /** "2 of 3 agents done so far". */
  fractionText?: string;
  /** "41.2K tokens · 14 tool uses". */
  usage?: string;
  /** A Workflow's agents; the row opens to them. */
  agents?: readonly BackgroundWorkAgentItem[];
  accessibilityLabel?: string;
  /** Opens what the work did (a Subagent's own transcript), read-only. */
  onOpen?: () => void;
  openLabel?: string;
}

export interface BackgroundWorkListLabels {
  running: string;
  finished: string;
  finishedFooter: string;
}

const useStyles = makeStyles((t) => ({
  list: { gap: t.spacing.md },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: t.spacing.xs, padding: t.spacing.sm },
  glyph: { paddingTop: airy.line },
  text: { flex: 1, gap: airy.chipV },
  head: { flexDirection: 'row', alignItems: 'baseline', gap: airy.stack },
  title: { flex: 1 },
  bar: { alignSelf: 'stretch' },
  agents: { paddingLeft: 38, paddingRight: t.spacing.sm, paddingBottom: t.spacing.xs, gap: 10 },
  agent: { flexDirection: 'row', alignItems: 'flex-start', gap: t.spacing.xs },
  agentText: { flex: 1, gap: airy.line },
}));

function AgentRow({ agent }: { agent: BackgroundWorkAgentItem }) {
  const styles = useStyles();
  return (
    <View style={styles.agent} testID={`work-agent-${agent.id}`}>
      <View style={styles.glyph}>
        <BackgroundWorkGlyph state={agent.state} />
      </View>
      <View style={styles.agentText}>
        <Text variant="subheadline" monospaced numberOfLines={2}>
          {agent.label}
        </Text>
        {agent.phase ? (
          <Text variant="caption" tone="secondary">
            {agent.phase}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function DetailRow({
  item,
  open,
  onToggle,
}: {
  item: BackgroundWorkDetailItem;
  open: boolean;
  onToggle: () => void;
}) {
  const styles = useStyles();
  const expandable = (item.agents?.length ?? 0) > 0;
  const body = (
    <View style={styles.row}>
      <View style={styles.glyph}>
        <BackgroundWorkGlyph state={item.state} />
      </View>
      <View style={styles.text}>
        <View style={styles.head}>
          <Text variant="body" monospaced={item.monospaced} numberOfLines={2} style={styles.title}>
            {item.title}
          </Text>
          {item.time ? (
            <Text variant="caption" tone="secondary" tabularNums>
              {item.time}
            </Text>
          ) : null}
        </View>
        {item.note ? (
          <Text variant="caption" tone="secondary">
            {item.note}
          </Text>
        ) : null}
        <Text variant="subheadline" tone="secondary" numberOfLines={3}>
          {item.body}
        </Text>
        {item.fraction ? (
          <View style={styles.text}>
            {item.state === 'running' || item.state === 'unconfirmed' || item.state === 'quiet' ? (
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
              {item.fractionText ?? `${item.fraction.done}/${item.fraction.total}`}
            </Text>
          </View>
        ) : null}
        {item.usage ? (
          <Text variant="caption" tone="secondary" tabularNums>
            {item.usage}
          </Text>
        ) : null}
        {item.onOpen ? (
          <Tappable
            onPress={item.onOpen}
            accessibilityRole="button"
            accessibilityLabel={`${item.openLabel ?? ''}, ${item.title}`}
            testID={`work-open-${item.id}`}
          >
            <Text variant="subheadline" tone="accent">
              {item.openLabel}
            </Text>
          </Tappable>
        ) : null}
      </View>
      {expandable ? (
        <Icon name={open ? 'chevronDown' : 'chevronRight'} size={14} color="textTertiary" />
      ) : null}
    </View>
  );
  return (
    <View testID={`work-sheet-${item.id}`}>
      {expandable ? (
        <Tappable
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={item.accessibilityLabel}
        >
          {body}
        </Tappable>
      ) : (
        body
      )}
      {expandable && open ? (
        <View style={styles.agents}>
          {item.agents?.map((agent) => (
            <AgentRow key={agent.id} agent={agent} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

interface BackgroundWorkListProps {
  unfinished: readonly BackgroundWorkDetailItem[];
  finished: readonly BackgroundWorkDetailItem[];
  /** Ids of the Workflows open to their agents. */
  expanded: ReadonlySet<string>;
  onToggle: (id: string) => void;
  labels: BackgroundWorkListLabels;
}

/**
 * Everything Chat lists as Background Work (Swift ChatBackgroundWorkSheet content): running work,
 * then what finished since the user's latest message. A Workflow opens to the agents it ran.
 */
export function BackgroundWorkList({
  unfinished,
  finished,
  expanded,
  onToggle,
  labels,
}: BackgroundWorkListProps) {
  const styles = useStyles();
  return (
    <View style={styles.list} testID="background-work-list">
      {unfinished.length > 0 ? (
        <Section title={labels.running}>
          {unfinished.map((item) => (
            <DetailRow
              key={item.id}
              item={item}
              open={expanded.has(item.id)}
              onToggle={() => onToggle(item.id)}
            />
          ))}
        </Section>
      ) : null}
      {finished.length > 0 ? (
        <Section title={labels.finished} footer={labels.finishedFooter}>
          {finished.map((item) => (
            <DetailRow
              key={item.id}
              item={item}
              open={expanded.has(item.id)}
              onToggle={() => onToggle(item.id)}
            />
          ))}
        </Section>
      ) : null}
    </View>
  );
}
