import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../primitives/Card';
import { Icon, type IconName } from '../primitives/Icon';
import { Spinner } from '../primitives/Spinner';
import { Tappable } from '../primitives/Tappable';
import { Text } from '../primitives/Text';
import { makeStyles, useTheme } from '../theme/theme';

const GLYPH = 18;

const useStyles = makeStyles((t) => ({
  stack: { gap: t.spacing.xs, paddingHorizontal: t.spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs },
  grow: { flex: 1, gap: t.spacing.xxs },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xxs, flexShrink: 0 },
  output: { paddingTop: t.spacing.xs },
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

/** Swift's tool card (command, trailing status, tap to expand output) and subagent group. */
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
      <View style={styles.stack} testID={testID}>
        {subagents.map((item) => (
          <SubagentCard key={item.id} item={item} openLabel={openLabel} />
        ))}
      </View>
    );
  }
  if (!tool) return null;
  const waiting = tool.status === 'waiting';
  return (
    <View style={styles.stack} testID={testID}>
      <Card
        onPress={onToggle}
        onLongPress={onLongPress}
        accessibilityLabel={[tool.title, tool.statusLabel].filter(Boolean).join(', ')}
      >
        <View style={styles.head}>
          <Icon name={tool.icon ?? 'terminal'} size={GLYPH} />
          <Text
            variant="footnote"
            monospaced
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
    </View>
  );
}
