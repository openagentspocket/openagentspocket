import { AgentKeysQueue, type ProgramShortcut, programShortcuts } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { type ActionMenuItem, toast } from '@openagentspocket/ui';
import { useMemo } from 'react';
import { cardText } from '@/blocked/text';
import { refreshAgentMode } from '../useAgentMode';
import { useAgentScreenIO } from '../useAgentScreenIO';
import type { AgentComposer } from './composerContext';

/**
 * The composer's shortcuts menu for an Agent's program: keys go to the Agent at once through
 * `agent.send_keys`; a command goes into the draft, for the user to send like any message.
 */
export function useAgentShortcuts(composer: AgentComposer, program: string): ActionMenuItem[] {
  const { hostId, paneId, store } = composer;
  const io = useAgentScreenIO(hostId, paneId);
  const keys = useMemo(() => new AgentKeysQueue((names) => io.sendKeys(names)), [io]);
  return useMemo(() => {
    const press = async (shortcut: Extract<ProgramShortcut, { kind: 'keys' }>) => {
      const delivery = await keys.deliver(shortcut.keys);
      if (delivery.kind === 'sent') refreshAgentMode(hostId, paneId);
      if (delivery.kind === 'failed')
        toast({ title: t("Couldn't reach the Agent, so the key may not have gone.") });
    };
    const shortcuts = programShortcuts(program);
    const firstCommand = shortcuts.findIndex((shortcut) => shortcut.kind === 'command');
    return shortcuts.map((shortcut, index) => ({
      key: `shortcut-${index}`,
      title: cardText(shortcut.title),
      subtitle: shortcut.kind === 'keys' ? shortcut.hint : shortcut.command,
      section: index === 0 ? t('Keys') : index === firstCommand ? t('Commands') : undefined,
      onPress: () =>
        shortcut.kind === 'keys'
          ? void press(shortcut)
          : store.insertIntoDraft(`${shortcut.command} `),
    }));
  }, [program, keys, store, hostId, paneId]);
}
