import { Children, Fragment, type ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../primitives/Card';
import { Icon } from '../primitives/Icon';
import { Tappable } from '../primitives/Tappable';
import { Text } from '../primitives/Text';
import { airy } from '../theme/metrics';
import { makeStyles, useTheme } from '../theme/theme';

const useStyles = makeStyles((t) => ({
  slot: { paddingVertical: airy.rowInset },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: t.spacing.sm },
  glyph: { paddingTop: airy.line },
  titles: { flex: 1, gap: airy.line },
  count: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xxs,
    backgroundColor: t.colors.control,
    borderRadius: t.radius.capsule,
    paddingHorizontal: t.spacing.xs,
    paddingVertical: airy.line,
    minHeight: 24,
  },
  body: { marginTop: t.spacing.xs, marginLeft: 0 },
  divider: {
    height: t.metrics.hairlineWidth,
    backgroundColor: t.hairline,
    marginVertical: t.spacing.xs,
  },
  nested: { marginLeft: t.spacing.md },
}));

export interface WorkspaceModel {
  title: string;
  /** "Studio Mac · /workspace/agentico", already joined. */
  subtitle?: string;
  agentCount: number;
  collapsed?: boolean;
}

interface WorkspaceCardProps {
  workspace: WorkspaceModel;
  /** The workspace's AgentCards (presentation `plain`), then nested worktrees. */
  children?: ReactNode;
  onToggle?: () => void;
  /** A checkout header that opens its worktree details. */
  onOpen?: () => void;
  testID?: string;
}

/**
 * One card per workspace: folder glyph, name, Host and path, a fold chip with the Agent count,
 * and the workspace's Agent rows inside it (without their own card).
 */
export function WorkspaceCard({
  workspace,
  children,
  onToggle,
  onOpen,
  testID = 'workspace-card',
}: WorkspaceCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  const collapsed = workspace.collapsed ?? false;
  const header = (
    <View style={styles.header}>
      <View style={styles.glyph}>
        <Icon name="folder" size={22} color="textSecondary" />
      </View>
      <Tappable
        style={styles.titles}
        onPress={onOpen}
        disabled={!onOpen}
        accessibilityRole={onOpen ? 'button' : undefined}
        testID={`${testID}-title`}
      >
        <Text variant="headline" numberOfLines={1}>
          {workspace.title}
        </Text>
        {workspace.subtitle ? (
          <Text variant="footnote" tone="secondary" numberOfLines={1}>
            {workspace.subtitle}
          </Text>
        ) : null}
      </Tappable>
      <Tappable
        onPress={onToggle}
        disabled={!onToggle}
        style={styles.count}
        accessibilityRole="button"
        accessibilityLabel={`${workspace.title}, ${workspace.agentCount}`}
        accessibilityState={{ expanded: !collapsed }}
        testID={`${testID}-fold`}
      >
        <Text variant="footnote" semibold tabularNums>
          {String(workspace.agentCount)}
        </Text>
        <View style={{ transform: [{ rotate: collapsed ? '0deg' : '90deg' }] }}>
          <Icon name="chevronRight" size={10} tint={theme.colors.textSecondary} />
        </View>
      </Tappable>
    </View>
  );
  return (
    <View style={styles.slot}>
      <Card testID={testID}>
        {header}
        {collapsed ? null : (
          <View style={styles.body}>
            {Children.toArray(children).map((child, index) => (
              <Fragment key={(child as { key?: string }).key ?? index}>
                {index > 0 ? <View style={styles.divider} testID={`${testID}-divider`} /> : null}
                {child}
              </Fragment>
            ))}
          </View>
        )}
      </Card>
    </View>
  );
}

/** Indents a linked git worktree under its repository checkout. */
export function NestedWorktree({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <View style={styles.nested}>{children}</View>;
}
