import type { ComposerInterrupt, ProgramSendPolicy } from '@openagentspocket/core';
import {
  AgentKeysQueue,
  type AgentSkill,
  type ChatCommand,
  type ComposerDeliveryPolicy,
  type ComposerSnapshot,
  chatActivityOf,
  chatCommands,
  chatDeliveryPolicy,
  composerInterrupt,
  createSendRules,
  sendPolicyForAgent,
  sentMessages,
} from '@openagentspocket/core';
import { herdrScreenIO, isBlockedPaneApi } from '@openagentspocket/transport';
import { useEffect, useMemo, useRef } from 'react';
import { useConsoleStore } from '@/console/hooks';
import { systemClock } from '@/console/systemClock';
import { useConversationRegistry } from '@/conversations/useConversation';

/** Chat's delivery for an Agent whose program Chat has no send rules for: the text goes as typed. */
const PLAIN_CHAT_DELIVERY: ComposerDeliveryPolicy = {
  route: 'chat',
  insertsIntoAttachWhenBlocked: false,
  outgoingText: (text) => text,
  validate: () => undefined,
};

export interface ChatSend {
  /** The program's send policy; null for a program Chat has none for. */
  readonly policy: ProgramSendPolicy | null;
  readonly delivery: ComposerDeliveryPolicy;
  /** The `/` menu: the Host's skills the program takes, and `/compact`. */
  readonly commands: readonly ChatCommand[];
  /** Chat's Stop for the program (its keys and guard); null without a policy. */
  readonly chatInterrupt: ComposerInterrupt | null;
}

/**
 * Everything Chat's send side needs for one Agent, asked of the program's `ProgramSendPolicy`: the
 * rules and delivery checks, the command menu and Stop. No program is named here. A Host whose
 * transport cannot read panes (the demo) sends without the checks. The Composer's messages are
 * followed against the transcript through the conversation store.
 */
export function useChatSend(input: {
  hostId: string;
  paneId: string;
  /** The program herdr names the Agent by. */
  program: string;
  snapshot: ComposerSnapshot;
  skills?: readonly AgentSkill[];
}): ChatSend {
  const { hostId, paneId, program, snapshot, skills } = input;
  const consoleStore = useConsoleStore();
  const registry = useConversationRegistry();
  const policy = useMemo(() => sendPolicyForAgent(program), [program]);
  const status = useRef(snapshot.status);
  status.current = snapshot.status;
  const conversation = useMemo(() => registry?.get(hostId, paneId), [registry, hostId, paneId]);
  const io = useMemo(
    () =>
      herdrScreenIO(paneId, (operation) =>
        consoleStore.withTransport(hostId, async (transport) => {
          if (!isBlockedPaneApi(transport)) throw new Error('This Host cannot read panes.');
          return operation(transport);
        }),
      ),
    [consoleStore, hostId, paneId],
  );
  const isIdle = chatActivityOf(snapshot.status) === 'idle';
  const commands = useMemo(
    () => (policy ? chatCommands(skills ?? [], isIdle, policy) : []),
    [policy, skills, isIdle],
  );
  const rules = useMemo(
    () => (policy ? createSendRules(policy, commands) : null),
    [policy, commands],
  );
  const delivery = useMemo(() => {
    if (!policy || !rules) return PLAIN_CHAT_DELIVERY;
    const canRead = () =>
      consoleStore
        .withTransport(hostId, async (transport) => isBlockedPaneApi(transport))
        .catch(() => false);
    const checked = chatDeliveryPolicy(policy, {
      rules,
      clock: systemClock,
      activity: () => chatActivityOf(status.current),
      readScreen: async () => {
        const screen = await io.readScreen();
        // A steer shown as returned may since have left the box.
        conversation?.inputBoxWasRead(screen);
        return screen;
      },
      // A program that can leave its conversation unreported is checked before the screen is read.
      confirmSession: () => conversation?.confirmSessionBeforeSend() ?? Promise.resolve(null),
      sendConcern: (outgoing, screen) => conversation?.sendConcern(outgoing, screen) ?? null,
      // The send's witness mark is on its way before the screen read.
      willReadScreen: () => conversation?.updateSends(sentMessages(messagesRef.current, rules)),
    });
    return {
      ...checked,
      preflight: async (text: string) =>
        (await canRead()) ? checked.preflight?.(text) : undefined,
      verify: async (sent: string) => ((await canRead()) ? (checked.verify?.(sent) ?? true) : true),
    };
  }, [policy, rules, consoleStore, hostId, io, conversation]);
  const messagesRef = useRef(snapshot.messages);
  messagesRef.current = snapshot.messages;
  const chatInterrupt = useMemo(() => {
    if (!policy) return null;
    const keys = new AgentKeysQueue((names) => io.sendKeys(names));
    return composerInterrupt(policy.stop, {
      keys,
      context: async () => ({
        screen: await io.readScreen(),
        activity: chatActivityOf(status.current),
      }),
    });
  }, [policy, io]);
  useEffect(() => {
    if (rules) conversation?.updateSends(sentMessages(snapshot.messages, rules));
  }, [conversation, rules, snapshot.messages]);
  return { policy, delivery, commands, chatInterrupt };
}
