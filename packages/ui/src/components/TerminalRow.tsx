import { Children, Fragment, type ReactNode } from 'react';
import { View } from 'react-native';
import { ActionMenu, type ActionMenuItem } from '../overlay/ActionMenu';
import { useRowMenu } from '../overlay/useRowMenu';
import { Card } from '../primitives/Card';
import { Icon } from '../primitives/Icon';
import { type SwipeAction, SwipeRow } from '../primitives/SwipeRow';
import { Tappable } from '../primitives/Tappable';
import { Text } from '../primitives/Text';
import { airy } from '../theme/metrics';
import { makeStyles } from '../theme/theme';
import { type AgentRowLabels, defaultAgentRowLabels } from './agentRowLabels';

const useStyles = makeStyles((t) => ({
  slot: { paddingVertical: airy.rowInset },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm,
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.sm,
  },
  pressed: { backgroundColor: t.colors.surfaceRaised },
  tile: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: airy.line },
  separator: {
    height: t.metrics.hairlineWidth,
    backgroundColor: t.hairline,
    marginLeft: t.spacing.md + 44 + t.spacing.sm,
  },
  newRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm,
    paddingHorizontal: t.spacing.md,
    minHeight: t.metrics.rowMinHeight,
  },
  plus: { width: 44, alignItems: 'center' },
}));

export interface TerminalModel {
  title: string;
  path?: string;
  host?: string;
}

interface TerminalRowProps {
  terminal: TerminalModel;
  onPress?: () => void;
  menu?: readonly ActionMenuItem[];
  /** Trailing swipe (Close); a full swipe runs the first. */
  swipeActions?: readonly SwipeAction[];
  testID?: string;
}

/** A shell pane: terminal tile, mono title, mono path, chevron. Lives inside a `TerminalGroup`. */
export function TerminalRow({
  terminal,
  onPress,
  menu,
  swipeActions,
  testID = 'terminal-row',
}: TerminalRowProps) {
  const styles = useStyles();
  const rowMenu = useRowMenu(menu, swipeActions);
  const body = (
    <Tappable
      onPress={onPress}
      onLongPress={rowMenu.onLongPress}
      accessibilityRole="button"
      accessibilityLabel={[terminal.title, terminal.path, terminal.host].filter(Boolean).join(', ')}
      {...rowMenu.a11y}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      testID={testID}
    >
      <Card level="control" padded={false} style={styles.tile}>
        <Icon name="terminal" size={20} color="textPrimary" />
      </Card>
      <View style={styles.text}>
        <Text variant="headline" monospaced numberOfLines={1}>
          {terminal.title}
        </Text>
        {terminal.path ? (
          <Text variant="footnote" monospaced tone="secondary" numberOfLines={1}>
            {terminal.path}
          </Text>
        ) : null}
      </View>
      <Icon name="chevronRight" size={13} color="textTertiary" />
    </Tappable>
  );
  return (
    <>
      {swipeActions?.length ? (
        <SwipeRow actions={swipeActions} fullSwipe={{ trailing: true }}>
          {body}
        </SwipeRow>
      ) : (
        body
      )}
      {menu?.length ? (
        <ActionMenu items={menu} title={terminal.title} {...rowMenu.menuProps} />
      ) : null}
    </>
  );
}

interface TerminalGroupProps {
  /** `TerminalRow`s. */
  children: ReactNode;
  /** The "+ New Terminal" footer; omit to hide it. */
  onNewTerminal?: () => void;
  labels?: AgentRowLabels;
  testID?: string;
}

/** One rounded card per workspace: its terminal rows split by hairlines, then "+ New Terminal". */
export function TerminalGroup({
  children,
  onNewTerminal,
  labels = defaultAgentRowLabels,
  testID = 'terminal-group',
}: TerminalGroupProps) {
  const styles = useStyles();
  const rows = Children.toArray(children);
  return (
    <View style={styles.slot}>
      <Card padded={false} testID={testID}>
        {rows.map((row, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the rows are static children
          <Fragment key={index}>
            {index > 0 ? <View style={styles.separator} /> : null}
            {row}
          </Fragment>
        ))}
        {onNewTerminal ? (
          <>
            {rows.length > 0 ? <View style={styles.separator} /> : null}
            <Tappable
              onPress={onNewTerminal}
              accessibilityRole="button"
              accessibilityLabel={labels.newTerminal}
              style={({ pressed }) => [styles.newRow, pressed && styles.pressed]}
              testID={`${testID}-new`}
            >
              <View style={styles.plus}>
                <Icon name="add" size={20} color="textSecondary" />
              </View>
              <Text tone="secondary">{labels.newTerminal}</Text>
            </Tappable>
          </>
        ) : null}
      </Card>
    </View>
  );
}
