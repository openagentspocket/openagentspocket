import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../primitives/Card';
import { Icon, type IconName } from '../primitives/Icon';
import { Spinner } from '../primitives/Spinner';
import { Tappable } from '../primitives/Tappable';
import { Text } from '../primitives/Text';
import { makeStyles, useTheme } from '../theme/theme';

const GLYPH = 18;
const LINE_GLYPH = 16;

const useStyles = makeStyles((t) => ({
  stack: { gap: t.spacing.xs, paddingHorizontal: t.spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs },
  grow: { flex: 1, gap: t.spacing.xxs },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xxs, flexShrink: 0 },
  output: { paddingTop: t.spacing.xs },
  line: { paddingHorizontal: t.spacing.md },
  lineHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xs,
    minHeight: t.metrics.minTapSize,
  },
  lineTitle: { flexShrink: 1, minWidth: 0 },
  lineBody: { paddingLeft: LINE_GLYPH + t.spacing.xs, paddingBottom: t.spacing.xs },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: t.metrics.minTapSize,
  },
}));

export type ToolStatus = 'running' | 'waiting' | 'done' | 'failed';

export interface SubagentItem {
  id: string;
  name: string;
  /** The subagent kind ('Explore', 'general-purpose'). */
  kind?: string;
  /** What it is doing while running. */
  detail?: string;
  status: ToolStatus;
  /** What a tap does: its transcript once it has one, else the Background Work sheet. */
  onOpen?: () => void;
}

interface ChatToolRowProps {
  /** The tool call: kind icon and command. Omit for a subagent group. */
  tool?: {
    icon?: IconName;
    title: string;
    status: ToolStatus;
    /** 'Exit 1', 'Waiting'. Translated by the caller. */
    statusLabel?: string;
    output?: string;
    /** The title is a command line: drawn monospaced. */
    monospaced?: boolean;
    /** Lines the call added and removed, shown at the end of the quiet line. */
    added?: number | null;
    removed?: number | null;
  };
  subagents?: readonly SubagentItem[];
  /** 'Open Subagent Transcript'. */
  openLabel?: string;
  /** What only an open row shows: output, diff, image. */
  detail?: ReactNode;
  expanded?: boolean;
  onToggle?: () => void;
  onLongPress?: () => void;
  testID?: string;
}

function useStatusInk(status: ToolStatus): string {
  const theme = useTheme();
  if (status === 'failed') return theme.colors.danger;
  if (status === 'waiting') return theme.colors.warning;
  if (status === 'done') return theme.colors.success;
  return theme.colors.textSecondary;
}

function StatusMark({ status, label }: { status: ToolStatus; label?: string }) {
  const styles = useStyles();
  const ink = useStatusInk(status);
  const theme = useTheme();
  const glyph: IconName | null =
    status === 'failed'
      ? 'errorCircle'
      : status === 'waiting'
        ? 'hand'
        : status === 'done'
          ? 'check'
          : null;
  return (
    <View style={styles.trailing} testID={`tool-status-${status}`}>
      {glyph ? <Icon name={glyph} size={14} tint={ink} /> : <Spinner size="small" />}
      {label ? (
        <Text variant="footnote" style={{ color: ink }}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

function SubagentCard({ item, openLabel }: { item: SubagentItem; openLabel?: string }) {
  const styles = useStyles();
  const running = item.status === 'running';
  return (
    <Card>
      <View style={styles.head}>
        <Icon name="bot" size={GLYPH} />
        <View style={styles.grow}>
          <Text variant="body" tone={item.status === 'waiting' ? 'secondary' : 'primary'}>
            {item.name}
          </Text>
          {item.kind || item.detail ? (
            <Text variant={running ? 'footnote' : 'subheadline'} tone="secondary" numberOfLines={2}>
              {running ? (item.detail ?? item.kind) : item.kind}
            </Text>
          ) : null}
        </View>
        <StatusMark status={item.status} />
      </View>
      {openLabel && item.onOpen && !running ? (
        <Tappable
          style={styles.link}
          onPress={item.onOpen}
          accessibilityRole="link"
          accessibilityLabel={`${openLabel}, ${item.name}`}
        >
          <Text variant="footnote" tone="secondary">
            {openLabel}
          </Text>
          <Icon name="chevronRight" size={11} />
        </Tappable>
      ) : null}
    </Card>
  );
}

/** A call that needs the user's eye: it failed, or it waits on an answer. Everything else is a quiet line. */
export function needsAttention(status: ToolStatus): boolean {
  return status === 'failed' || status === 'waiting';
}

type ToolProps = Omit<ChatToolRowProps, 'subagents' | 'openLabel' | 'testID'> & {
  tool: NonNullable<ChatToolRowProps['tool']>;
  /** A finished line says how it ended (a Subagent's check), not only a running one. */
  marked?: boolean;
};

function LineCounts({ added, removed }: { added?: number | null; removed?: number | null }) {
  if (!added && !removed) return null;
  return (
    <>
      {added ? <Text variant="footnote" tone="success">{`+${added}`}</Text> : null}
      {removed ? <Text variant="footnote" tone="danger">{`-${removed}`}</Text> : null}
    </>
  );
}

/** The quiet line: kind glyph, summary, line counts, a spinner while it runs, and a chevron. */
function ToolLine({ tool, detail, expanded = false, onToggle, onLongPress, marked }: ToolProps) {
  const styles = useStyles();
  return (
    <View style={styles.line}>
      <Tappable
        style={styles.lineHead}
        onPress={onToggle}
        onLongPress={onLongPress}
        accessibilityRole="button"
        accessibilityLabel={tool.title}
        accessibilityState={{ expanded, busy: tool.status === 'running' }}
        testID={`tool-line-${tool.status}`}
      >
        <Icon name={tool.icon ?? 'terminal'} size={LINE_GLYPH} />
        <Text
          variant="subheadline"
          tone="secondary"
          monospaced={tool.monospaced}
          numberOfLines={1}
          style={styles.lineTitle}
        >
          {tool.title}
        </Text>
        <LineCounts added={tool.added} removed={tool.removed} />
        {tool.status === 'running' ? (
          <Spinner size="small" />
        ) : marked ? (
          <StatusMark status={tool.status} />
        ) : null}
        {onToggle ? <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={11} /> : null}
      </Tappable>
      {expanded && (tool.output || detail) ? (
        <View style={styles.lineBody}>
          {tool.output ? (
            <Text variant="caption" monospaced tone="secondary">
              {tool.output}
            </Text>
          ) : null}
          {detail}
        </View>
      ) : null}
    </View>
  );
}

/** The card a call that needs attention keeps: command, trailing status, tap to expand output. */
function ToolCard({ tool, detail, expanded = false, onToggle, onLongPress }: ToolProps) {
  const styles = useStyles();
  const waiting = tool.status === 'waiting';
  return (
    <Card
      onPress={onToggle}
      onLongPress={onLongPress}
      accessibilityLabel={[tool.title, tool.statusLabel].filter(Boolean).join(', ')}
    >
      <View style={styles.head}>
        <Icon name={tool.icon ?? 'terminal'} size={GLYPH} />
        <Text
          variant="footnote"
          monospaced={tool.monospaced}
          tone={waiting ? 'secondary' : 'primary'}
          numberOfLines={expanded ? undefined : 2}
          style={{ flex: 1, minWidth: 0 }}
        >
          {tool.title}
        </Text>
        <StatusMark status={tool.status} label={tool.statusLabel} />
      </View>
      {expanded && tool.output ? (
        <View style={styles.output}>
          <Text variant="caption" monospaced tone="secondary">
            {tool.output}
          </Text>
        </View>
      ) : null}
      {expanded && detail ? <View style={styles.output}>{detail}</View> : null}
    </Card>
  );
}

/** A Subagent: the quiet line (its name, its state, a tap that opens it), a card when it needs attention. */
function Subagent({ item, openLabel }: { item: SubagentItem; openLabel?: string }) {
  const styles = useStyles();
  return needsAttention(item.status) ? (
    <View style={styles.stack}>
      <SubagentCard item={item} openLabel={openLabel} />
    </View>
  ) : (
    <ToolLine
      tool={{ icon: 'bot', title: item.name, status: item.status }}
      onToggle={item.onOpen}
      marked
    />
  );
}

/**
 * A tool call or a fold of calls (Swift's tool row, made lighter): a borderless quiet line that
 * opens on tap, and a card only for a call that needs attention (`needsAttention`). Also the
 * subagent group: a quiet line per Subagent that opens it, a card with its transcript link when
 * it failed or waits on the user.
 */
export function ChatToolRow({
  tool,
  subagents,
  openLabel,
  detail,
  expanded = false,
  onToggle,
  onLongPress,
  testID = 'chat-tool-row',
}: ChatToolRowProps) {
  const styles = useStyles();
  if (subagents?.length) {
    return (
      <View testID={testID}>
        {subagents.map((item) => (
          <Subagent key={item.id} item={item} openLabel={openLabel} />
        ))}
      </View>
    );
  }
  if (!tool) return null;
  const props = { tool, detail, expanded, onToggle, onLongPress };
  return needsAttention(tool.status) ? (
    <View style={styles.stack} testID={testID}>
      <ToolCard {...props} />
    </View>
  ) : (
    <View testID={testID}>
      <ToolLine {...props} />
    </View>
  );
}
