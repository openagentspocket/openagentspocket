import {
  type AgentJumpResult,
  type JumpDirection,
  messageJumpProfile,
  paneTakesWheelJump,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { systemClock } from '@openagentspocket/transport';
import { type ActionMenuItem, toast } from '@openagentspocket/ui';
import { useEffect, useMemo } from 'react';
import { useConversationRegistry } from '@/conversations/useConversation';
import type { AgentTerminalSession } from './AgentTerminalSession';

/** What a finished walk has to say; a jump that arrived shows it on the terminal instead. */
function jumpNotice(direction: JumpDirection, result: AgentJumpResult): string | null {
  switch (result) {
    case 'reachedEnd':
      return direction === 'older' ? t('No earlier messages') : t('This is the latest message');
    case 'exhausted':
      return t('No message nearby. Try again to keep going.');
    case 'failed':
      return t("Couldn't read the screen");
    default:
      return null;
  }
}

/**
 * Earlier and Newer message for an Agent's terminal: walks the remote TUI between the user's
 * messages, reading the pane on the Host for each frame. Offered only where panes can be read; a
 * walk ends with the view.
 */
export function useTerminalMessageJump(
  session: AgentTerminalSession,
  hostId: string,
  paneId: string,
  program: string | null | undefined,
): ActionMenuItem[] {
  const registry = useConversationRegistry();
  const jump = useMemo(
    () =>
      registry?.canReadScreens && paneTakesWheelJump(paneId)
        ? session.makeMessageJump({
            clock: systemClock,
            profile: messageJumpProfile(program),
            readFrame: () => registry.readVisibleText(hostId, paneId),
          })
        : null,
    [registry, session, hostId, paneId, program],
  );
  useEffect(() => (jump ? session.bindMessageJump(jump) : undefined), [jump, session]);

  if (!jump?.canJump) return [];
  const walk = (direction: JumpDirection) => async () => {
    const notice = jumpNotice(direction, await jump.jump(direction));
    if (notice) toast({ title: notice });
  };
  return [
    {
      key: 'jump-older',
      title: t('Earlier message'),
      icon: 'arrowUp',
      disabled: jump.isRunning,
      onPress: () => void walk('older')(),
    },
    {
      key: 'jump-newer',
      title: t('Newer message'),
      icon: 'arrowDown',
      disabled: jump.isRunning,
      onPress: () => void walk('newer')(),
    },
  ];
}
