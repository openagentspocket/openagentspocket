import {
  AgentKeysQueue,
  commandShortcutDraft,
  type ProgramShortcut,
  programShortcuts,
  sendPolicyForAgent,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { type ActionMenuItem, toast } from '@openagentspocket/ui';
import { useMemo } from 'react';
import { cardText } from '@/blocked/text';
import type { Surface } from '../surface';
import { refreshAgentMode } from '../useAgentMode';
import { useAgentScreenIO } from '../useAgentScreenIO';
import type { AgentComposer } from './composerContext';

/**
 * The composer's shortcuts menu for an Agent's program: keys go to the Agent at once through
 * `agent.send_keys`; a command goes into the draft, for the user to send like any message. A
 * command that does not run from Chat (`commandShortcutDraft`) takes the user to the terminal
 * first, and is left out of Chat's menu where there is no way there.
 */
export function useAgentShortcuts(
  composer: AgentComposer,
  program: string,
  surface: Surface,
  showTerminal: (() => void) | undefined,
): ActionMenuItem[] {
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
    const policy = sendPolicyForAgent(program);
    const type = (shortcut: Extract<ProgramShortcut, { kind: 'command' }>) => {
      const draft = commandShortcutDraft(shortcut, surface, policy);
      if (draft.surface !== surface) showTerminal?.();
      store.insertIntoDraft(draft.text);
    };
    const shortcuts = programShortcuts(program).filter(
      (shortcut) =>
        shortcut.kind === 'keys' ||
        showTerminal !== undefined ||
        commandShortcutDraft(shortcut, surface, policy).surface === surface,
    );
    const firstCommand = shortcuts.findIndex((shortcut) => shortcut.kind === 'command');
    return shortcuts.map((shortcut, index) => ({
      key: `shortcut-${index}`,
      title: cardText(shortcut.title),
      subtitle: shortcut.kind === 'keys' ? shortcut.hint : shortcut.command,
      section: index === 0 ? t('Keys') : index === firstCommand ? t('Commands') : undefined,
      onPress: () => (shortcut.kind === 'keys' ? void press(shortcut) : type(shortcut)),
    }));
  }, [program, keys, store, hostId, paneId, surface, showTerminal]);
}
