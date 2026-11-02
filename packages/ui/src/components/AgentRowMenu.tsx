import type { ReactNode } from 'react';
import { impact } from '../haptics';
import type { ActionMenuItem } from '../overlay/ActionMenu';
import { LiftedMenu } from '../overlay/LiftedMenu';
import type { SwipeAction } from '../primitives/SwipeRow';
import { type AgentRowLabels, defaultAgentRowLabels } from './agentRowLabels';

interface AgentRowMenuProps {
  /** The pressed row, kept visible at its own width above the menu. */
  preview: ReactNode;
  items: readonly ActionMenuItem[];
  visible: boolean;
  onClose: () => void;
  /** Draws in place instead of a Modal (the gallery and tests). */
  inline?: boolean;
  testID?: string;
}

/** The long-press menu of an Agent row: the lifted card over a raised menu, with a haptic. */
export function AgentRowMenu({ testID = 'agent-row-menu', ...props }: AgentRowMenuProps) {
  return <LiftedMenu {...props} testID={testID} onOpen={() => impact('medium')} />;
}

interface AgentRowActionsInput {
  pinned?: boolean;
  onPin?: () => void;
  onDetails?: () => void;
  onClose?: () => void;
  labels?: AgentRowLabels;
}

export interface AgentRowActions {
  /** Long-press menu (Pin, Details, Close Pane), also the accessibility actions. */
  menu: ActionMenuItem[];
  /** Swipe right: Pin. */
  leading: SwipeAction[];
  /** Swipe left: Close. */
  trailing: SwipeAction[];
}

/** The three actions every Agent row offers, in the menu and as swipes. */
export function agentRowActions({
  pinned = false,
  onPin,
  onDetails,
  onClose,
  labels = defaultAgentRowLabels,
}: AgentRowActionsInput): AgentRowActions {
  const pinTitle = pinned ? labels.unpin : labels.pin;
  const menu: ActionMenuItem[] = [];
  if (onPin) menu.push({ key: 'pin', title: pinTitle, icon: 'pin', onPress: onPin });
  if (onDetails)
    menu.push({ key: 'details', title: labels.details, icon: 'info', onPress: onDetails });
  if (onClose)
    menu.push({
      key: 'close',
      title: labels.closePane,
      icon: 'trash',
      destructive: true,
      onPress: onClose,
    });
  return {
    menu,
    leading: onPin
      ? [{ key: 'pin', title: pinTitle, icon: 'pin', tone: 'accent', onPress: onPin }]
      : [],
    trailing: onClose
      ? [{ key: 'close', title: labels.close, icon: 'trash', tone: 'danger', onPress: onClose }]
      : [],
  };
}
