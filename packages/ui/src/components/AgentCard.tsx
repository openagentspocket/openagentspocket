import { Pressable, View } from 'react-native';
import type { ActionMenuItem } from '../overlay/ActionMenu';
import { loadSwiftUi, NativePreviewMenu, supportsNativePreview } from '../overlay/NativeActionMenu';
import { useRowMenu } from '../overlay/useRowMenu';
import { Card } from '../primitives/Card';
import { type SwipeAction, SwipeRow } from '../primitives/SwipeRow';
import { airy } from '../theme/metrics';
import { makeStyles } from '../theme/theme';
import { AgentCardBody, type AgentCardModel, agentCardLabel } from './AgentCardBody';
import { AgentRowMenu } from './AgentRowMenu';
import { type AgentRowLabels, defaultAgentRowLabels } from './agentRowLabels';

export type { AgentCardModel } from './AgentCardBody';

/** row: the flat list row with a hairline below; card: its own card (workspace, board); plain: no chrome. */
export type AgentCardPresentation = 'row' | 'card' | 'plain';

const useStyles = makeStyles((t) => ({
  row: { paddingVertical: t.spacing.sm },
  /** The divider runs edge to edge: it bleeds through the screen inset the row content respects. */
  separator: {
    ...({ position: 'absolute', bottom: 0 } as const),
    left: -t.metrics.screenInset,
    right: -t.metrics.screenInset,
    height: t.metrics.hairlineWidth,
    backgroundColor: t.hairline,
  },
  cardSlot: { paddingVertical: airy.rowInset },
  pressed: { backgroundColor: t.colors.surfaceRaised },
  ring: {
    ...({ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const),
    borderWidth: 2,
    borderColor: t.colors.accent,
    borderRadius: t.metrics.cardRadius,
  },
}));

export interface AgentCardProps {
  agent: AgentCardModel;
  presentation?: AgentCardPresentation;
  /** The row open in the detail column (iPad): a 2 pt accent ring. */
  selected?: boolean;
  onPress?: () => void;
  /** Long press lifts the card above these (see `agentRowActions`). */
  menu?: readonly ActionMenuItem[];
  /**
   * lifted (default): the JS popover with the card lifted above it. native: the system context menu
   * with the card as its preview where @expo/ui provides it (iOS), else the lifted popover.
   */
  menuPresentation?: 'lifted' | 'native';
  /** Swipe right (Pin); a full swipe runs the first. */
  leadingSwipeActions?: readonly SwipeAction[];
  /** Swipe left (Close); a full swipe runs the first. */
  swipeActions?: readonly SwipeAction[];
  showProgramName?: boolean;
  labels?: AgentRowLabels;
  testID?: string;
}

/**
 * An Agent on the Agents list, Home and the board: program mark, title, status capsule, the
 * blocked prompt, subtitle and Host, path and diff counts. Tap opens the detail; swipe pins or
 * closes; long press lifts the card above its menu.
 */
export function AgentCard({
  agent,
  presentation = 'row',
  selected = false,
  onPress,
  menu,
  menuPresentation = 'lifted',
  leadingSwipeActions,
  swipeActions,
  showProgramName,
  labels = defaultAgentRowLabels,
  testID = 'agent-card',
}: AgentCardProps) {
  const styles = useStyles();
  const rowMenu = useRowMenu(menu, swipeActions, leadingSwipeActions);
  const body = (
    <AgentCardBody
      agent={agent}
      chevron={presentation === 'row'}
      showProgramName={showProgramName}
      labels={labels}
    />
  );
  const a11y = {
    accessible: true,
    accessibilityRole: 'button' as const,
    accessibilityLabel: agentCardLabel(agent, labels),
    ...rowMenu.a11y,
  };
  const nativeUi = menuPresentation === 'native' && menu?.length ? loadSwiftUi() : null;
  const native = supportsNativePreview(nativeUi) ? nativeUi : null;
  const open = native ? undefined : rowMenu.onLongPress;
  const front =
    presentation === 'card' ? (
      <View>
        <Card
          onPress={onPress}
          onLongPress={open}
          accessibilityLabel={a11y.accessibilityLabel}
          accessibilityActions={a11y.accessibilityActions}
          onAccessibilityAction={a11y.onAccessibilityAction}
          testID={testID}
        >
          {body}
        </Card>
        {selected ? (
          <View style={styles.ring} pointerEvents="none" testID="agent-card-selected" />
        ) : null}
      </View>
    ) : (
      <Pressable
        {...a11y}
        onPress={onPress}
        onLongPress={open}
        style={({ pressed }) => [
          presentation === 'row' && styles.row,
          pressed && styles.pressed,
          selected && styles.pressed,
        ]}
        testID={testID}
      >
        {body}
      </Pressable>
    );
  const swipeable = swipeActions?.length || leadingSwipeActions?.length;
  const lifted = <Card>{body}</Card>;
  const swiped = swipeable ? (
    <SwipeRow
      actions={swipeActions}
      leadingActions={leadingSwipeActions}
      fullSwipe={{ leading: true, trailing: true }}
    >
      {front}
    </SwipeRow>
  ) : (
    front
  );
  const slot =
    native && menu ? (
      <NativePreviewMenu ui={native} items={menu} preview={lifted}>
        {swiped}
      </NativePreviewMenu>
    ) : (
      swiped
    );
  return (
    <View style={presentation === 'card' ? styles.cardSlot : undefined}>
      {slot}
      {presentation === 'row' ? (
        <View style={styles.separator} pointerEvents="none" testID={`separator-${testID}`} />
      ) : null}
      {menu?.length && !native ? (
        <AgentRowMenu preview={lifted} items={menu} {...rowMenu.menuProps} />
      ) : null}
    </View>
  );
}
