import { View } from 'react-native';
import { Badge, StatusPill } from '../primitives/Badge';
import { Icon } from '../primitives/Icon';
import { ProgramMark } from '../primitives/ProgramMark';
import { DisclosureChevron } from '../primitives/SectionHeader';
import { StatusOrb } from '../primitives/StatusOrb';
import { Text } from '../primitives/Text';
import type { Status } from '../theme/status';
import { makeStyles, useTheme } from '../theme/theme';
import { type AgentRowLabels, defaultAgentRowLabels } from './agentRowLabels';

export interface AgentCardModel {
  title: string;
  /** The program herdr reports ("claude", "codex"); a shell has none. */
  program: string;
  status: Status;
  /** Blocked only: the question the Agent asks, in mono under the title. */
  blockedPrompt?: string;
  subtitle?: string;
  host?: string;
  path?: string;
  diff?: { added: number; removed: number };
  /** Low context only: "16 %" (the pill is amber). */
  contextLeft?: string;
  /** The Host is disconnected; the card is the saved copy. */
  saved?: boolean;
  /** Pinned rows carry a tertiary pin glyph before the title. */
  pinned?: boolean;
}

const useStyles = makeStyles((t) => ({
  root: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs },
  content: { flex: 1, gap: 3 },
  line: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs },
  title: { flex: 1, flexShrink: 1 },
  grow: { flex: 1, flexShrink: 1 },
  bubble: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: t.metrics.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prompt: { flex: 1, flexShrink: 1 },
  pillGap: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xxs },
  diff: { flexDirection: 'row', gap: t.spacing.xxs },
  contextPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
}));

interface AgentCardBodyProps {
  agent: AgentCardModel;
  /** The trailing disclosure chevron of a pushing row. */
  chevron?: boolean;
  /** Also draws the program's name after the title (board and wide layouts). */
  showProgramName?: boolean;
  labels?: AgentRowLabels;
}

/** The four lines of an Agent card: title and status, blocked prompt, subtitle and Host, path and diff. */
export function AgentCardBody({
  agent,
  chevron = false,
  showProgramName = false,
  labels = defaultAgentRowLabels,
}: AgentCardBodyProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { status } = agent;
  const warning = theme.colors.warning;
  const hasMeta = Boolean(agent.subtitle || agent.host);
  const hasPath = Boolean(agent.path || agent.diff);
  return (
    <View style={styles.root}>
      <View style={styles.content}>
        <View style={styles.line}>
          <ProgramMark program={agent.program} size={22} />
          <View style={[styles.line, styles.title]}>
            <Text variant="headline" numberOfLines={1} style={styles.grow}>
              {agent.title}
            </Text>
            {agent.pinned ? <Icon name="pin" size={12} color="textTertiary" /> : null}
            {showProgramName ? (
              <Text variant="caption" tone="secondary" numberOfLines={1}>
                {agent.program}
              </Text>
            ) : null}
          </View>
          <View style={styles.pillGap}>
            {agent.saved ? <Badge label={labels.saved} kind="outline" /> : null}
            {agent.contextLeft ? (
              <View
                style={[styles.contextPill, { backgroundColor: theme.wash(warning) }]}
                accessible
                accessibilityLabel={labels.contextLow(agent.contextLeft)}
                testID="agent-card-context"
              >
                <Icon name="warning" size={10} tint={warning} />
                <Text variant="caption2" semibold tabularNums style={{ color: warning }}>
                  {agent.contextLeft}
                </Text>
              </View>
            ) : null}
            <StatusPill
              status={status}
              label={labels.status[status]}
              leading={status === 'working' ? <StatusOrb size={12} /> : undefined}
            />
          </View>
        </View>
        {status === 'blocked' && agent.blockedPrompt ? (
          <View style={styles.line} testID="agent-card-prompt">
            <View style={[styles.bubble, { borderColor: theme.status('blocked') }]}>
              <Text variant="caption2" semibold style={{ color: theme.status('blocked') }}>
                ?
              </Text>
            </View>
            <Text
              variant="footnote"
              monospaced
              numberOfLines={2}
              style={[styles.prompt, { color: theme.status('blocked') }]}
            >
              {agent.blockedPrompt}
            </Text>
          </View>
        ) : null}
        {hasMeta ? (
          <View style={styles.line}>
            <Text variant="footnote" tone="secondary" numberOfLines={1} style={styles.grow}>
              {agent.subtitle ?? ''}
            </Text>
            {agent.host ? (
              <Text variant="footnote" tone="secondary" numberOfLines={1}>
                {agent.host}
              </Text>
            ) : null}
          </View>
        ) : null}
        {hasPath ? (
          <View style={styles.line}>
            <Text variant="footnote" tone="secondary" numberOfLines={1} style={styles.grow}>
              {agent.path ?? ''}
            </Text>
            {agent.diff ? (
              <View style={styles.diff} testID="agent-card-diff">
                <Text
                  variant="footnote"
                  monospaced
                  tabularNums
                  tone="success"
                >{`+${agent.diff.added}`}</Text>
                <Text
                  variant="footnote"
                  monospaced
                  tabularNums
                  tone="danger"
                >{`−${agent.diff.removed}`}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
      {chevron ? <DisclosureChevron expanded={false} /> : null}
    </View>
  );
}

/** What a screen reader hears for the whole card. */
export function agentCardLabel(agent: AgentCardModel, labels: AgentRowLabels): string {
  return [
    agent.title,
    labels.status[agent.status],
    agent.status === 'blocked' ? agent.blockedPrompt : undefined,
    agent.subtitle,
    agent.host,
    agent.path,
    agent.contextLeft ? labels.contextLow(agent.contextLeft) : undefined,
  ]
    .filter(Boolean)
    .join(', ');
}
