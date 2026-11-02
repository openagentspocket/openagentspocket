import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { Markdown } from '../markdown/Markdown';
import { Button } from '../primitives/Button';
import { EmptyState } from '../primitives/EmptyState';
import { GlassCapsule } from '../primitives/GlassCapsule';
import { Icon, type IconName } from '../primitives/Icon';
import { Text } from '../primitives/Text';
import { makeStyles, useTheme } from '../theme/theme';

/** One row of a subagent's transcript. */
export type SubagentRow =
  | { id: string; kind: 'user'; text: string }
  | { id: string; kind: 'assistant'; text: string }
  | { id: string; kind: 'tool'; summary: string; detail?: string; icon?: IconName };

export type SubagentPhase = 'loading' | 'loaded' | 'empty' | 'missing' | 'failed';

export interface SubagentTranscriptLabels {
  back: string;
  readOnly: string;
  partial: string;
  loading: string;
  emptyTitle: string;
  emptyMessage: string;
  missingTitle: string;
  missingMessage: string;
  failedTitle: string;
  retry: string;
}

export const defaultSubagentLabels: SubagentTranscriptLabels = {
  back: 'Back',
  readOnly: 'Read-only',
  partial: 'Showing the latest part',
  loading: 'Loading subagent transcript…',
  emptyTitle: 'Nothing Recorded Yet',
  emptyMessage: "This subagent hasn't written anything yet.",
  missingTitle: 'Transcript Not Found',
  missingMessage:
    'The Host has no transcript for this subagent. Claude Code may have cleaned it up.',
  failedTitle: "Couldn't Load the Transcript",
  retry: 'Try Again',
};

const useStyles = makeStyles((t) => ({
  root: { flex: 1, minHeight: 640, backgroundColor: t.colors.canvas },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: t.metrics.screenInset,
    paddingVertical: t.spacing.xs,
  },
  back: { width: t.metrics.minTapSize, justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center' },
  spacer: { width: t.metrics.minTapSize },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xs,
    paddingHorizontal: t.metrics.screenInset,
    paddingVertical: t.spacing.xs,
    backgroundColor: t.colors.surface,
  },
  timeline: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: t.metrics.screenInset,
    paddingVertical: t.spacing.md,
    gap: t.spacing.md,
  },
  userBubble: {
    alignSelf: 'flex-end',
    maxWidth: '85%',
    backgroundColor: t.colors.control,
    borderRadius: 20,
    paddingHorizontal: t.spacing.sm,
    paddingVertical: t.spacing.xs,
  },
  tool: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xs,
    backgroundColor: t.colors.surface,
    borderRadius: t.metrics.cardRadius,
    borderWidth: t.metrics.hairlineWidth,
    borderColor: t.hairline,
    paddingHorizontal: t.spacing.sm,
    paddingVertical: t.spacing.xs,
  },
  toolLabel: { flex: 1 },
  toolDetail: { paddingHorizontal: t.spacing.sm, paddingTop: t.spacing.xxs },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: t.spacing.sm },
}));

function ToolRow({ row }: { row: Extract<SubagentRow, { kind: 'tool' }> }) {
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const expandable = row.detail !== undefined;
  return (
    <View>
      <Pressable
        onPress={expandable ? () => setOpen((value) => !value) : undefined}
        accessibilityRole="button"
        accessibilityLabel={row.summary}
        accessibilityState={{ expanded: expandable ? open : undefined }}
        testID={`subagent-tool-${row.id}`}
        style={styles.tool}
      >
        <Icon name={row.icon ?? 'search'} size={17} />
        <Text variant="subheadline" numberOfLines={1} style={styles.toolLabel}>
          {row.summary}
        </Text>
        <Icon name={open ? 'chevronDown' : 'chevronRight'} size={13} color="textTertiary" />
      </Pressable>
      {open ? (
        <Text
          variant="caption"
          tone="secondary"
          monospaced
          selectable
          style={styles.toolDetail}
          testID={`subagent-tool-detail-${row.id}`}
        >
          {row.detail}
        </Text>
      ) : null}
    </View>
  );
}

interface ClaudeSubagentTranscriptProps {
  title: string;
  /** The subagent's type ("Explore"), after "Read-only ·". */
  kind?: string;
  phase?: SubagentPhase;
  /** Only the tail of a long transcript was read. */
  partial?: boolean;
  rows: readonly SubagentRow[];
  failureMessage?: string;
  onBack: () => void;
  onRetry?: () => void;
  labels?: Partial<SubagentTranscriptLabels>;
  testID?: string;
}

/**
 * A subagent's own transcript, pushed from its call row in Chat: back button, task title, a
 * read-only hint naming the subagent type, then the timeline. No composer, no status line, and
 * nothing here sends input anywhere.
 */
export function ClaudeSubagentTranscript({
  title,
  kind,
  phase = 'loaded',
  partial = false,
  rows,
  failureMessage,
  onBack,
  onRetry,
  labels,
  testID = 'subagent-transcript',
}: ClaudeSubagentTranscriptProps) {
  const styles = useStyles();
  const theme = useTheme();
  const text = { ...defaultSubagentLabels, ...labels };
  const hint = [text.readOnly, kind, partial && phase === 'loaded' ? text.partial : undefined]
    .filter(Boolean)
    .join(' · ');

  const content = () => {
    switch (phase) {
      case 'loading':
        return (
          <View style={styles.center} testID="subagent-loading">
            <ActivityIndicator color={theme.colors.textSecondary} />
            <Text variant="subheadline" tone="secondary">
              {text.loading}
            </Text>
          </View>
        );
      case 'empty':
        return (
          <EmptyState
            icon="emptyTray"
            title={text.emptyTitle}
            message={text.emptyMessage}
            testID="subagent-empty"
          />
        );
      case 'missing':
        return (
          <EmptyState
            icon="folder"
            title={text.missingTitle}
            message={text.missingMessage}
            testID="subagent-missing"
          />
        );
      case 'failed':
        return (
          <EmptyState
            icon="warning"
            title={text.failedTitle}
            message={failureMessage}
            testID="subagent-failed"
            actions={
              onRetry ? <Button kind="secondary" title={text.retry} onPress={onRetry} /> : undefined
            }
          />
        );
      default:
        return (
          <ScrollView contentContainerStyle={styles.timeline} testID="subagent-timeline">
            {rows.map((row) => {
              if (row.kind === 'user')
                return (
                  <View key={row.id} style={styles.userBubble}>
                    <Text variant="subheadline">{row.text}</Text>
                  </View>
                );
              if (row.kind === 'assistant') return <Markdown key={row.id} text={row.text} />;
              return <ToolRow key={row.id} row={row} />;
            })}
          </ScrollView>
        );
    }
  };

  return (
    <View style={styles.root} testID={testID}>
      <View style={styles.bar}>
        <View style={styles.back}>
          <GlassCapsule>
            <Button kind="text" icon="arrowLeft" accessibilityLabel={text.back} onPress={onBack} />
          </GlassCapsule>
        </View>
        <Text variant="headline" numberOfLines={1} accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        <View style={styles.spacer} />
      </View>
      <View style={styles.hint} accessible testID="subagent-read-only">
        <Icon name="eye" size={15} />
        <Text variant="footnote" tone="secondary">
          {hint}
        </Text>
      </View>
      {content()}
    </View>
  );
}
