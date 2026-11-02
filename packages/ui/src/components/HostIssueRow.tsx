import { Pressable, View } from 'react-native';
import { Icon } from '../primitives/Icon';
import { Text } from '../primitives/Text';
import { makeStyles, useTheme } from '../theme/theme';
import { type AgentRowLabels, defaultAgentRowLabels } from './agentRowLabels';

export interface HostIssue {
  hostName: string;
  kind: 'offline' | 'unreachable' | 'error';
  /** Overrides the default "<Host> is offline" line. */
  message?: string;
}

const useStyles = makeStyles((t) => ({
  stack: { paddingHorizontal: t.spacing.md, paddingVertical: t.spacing.xxs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm,
    minHeight: t.metrics.minTapSize,
  },
  glyph: { width: 28, alignItems: 'center' },
  text: { flexShrink: 1 },
  pressed: { opacity: 0.6 },
}));

interface HostIssueRowProps {
  issues: readonly HostIssue[];
  /** Opens the Host's connection sheet (one Host) or the Hosts tab (the summary row). */
  onOpen?: (issue?: HostIssue) => void;
  labels?: AgentRowLabels;
  testID?: string;
}

/** The amber "<Host> is offline" lines above the first section: one per Host, a summary row from three. */
export function HostIssueRow({
  issues,
  onOpen,
  labels = defaultAgentRowLabels,
  testID = 'host-issue-row',
}: HostIssueRowProps) {
  const styles = useStyles();
  const theme = useTheme();
  if (issues.length === 0) return null;
  const ink = theme.colors.warning;
  const lines =
    issues.length >= 3
      ? [{ key: 'summary', text: labels.hostsOffline(issues.length), issue: undefined }]
      : issues.map((issue) => ({
          key: issue.hostName,
          text: issue.message ?? labels.hostOffline(issue.hostName),
          issue,
        }));
  return (
    <View style={styles.stack} testID={testID}>
      {lines.map((line) => (
        <Pressable
          key={line.key}
          onPress={onOpen ? () => onOpen(line.issue) : undefined}
          disabled={!onOpen}
          accessibilityRole={onOpen ? 'button' : 'text'}
          accessibilityLabel={line.text}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          testID={`${testID}-${line.key}`}
        >
          <View style={styles.glyph}>
            <Icon name="wifiSlash" size={20} tint={ink} />
          </View>
          <Text variant="body" style={[styles.text, { color: ink }]} numberOfLines={1}>
            {line.text}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
