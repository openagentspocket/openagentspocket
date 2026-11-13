import {
  type ChatEntry,
  type ConversationState,
  emptyTranscript,
  initialSnapshot,
  toolActivity,
  userMessage,
} from '@openagentspocket/core';

interface DemoChat {
  prompt: string;
  command: string;
  answer: string;
  /** The Agent is mid-turn: the turn has no end yet. */
  working: boolean;
}

/** What each demo Agent was asked, by `host/pane`: the transcript the demo Host has no files for. */
const CHATS: Readonly<Record<string, DemoChat>> = {
  'demo/p1': {
    prompt: 'Add the sessions index to the staging database.',
    command: 'pnpm db:migrate --dry-run',
    answer: 'The migration is ready. It adds one index and touches no rows.',
    working: true,
  },
  'demo/p2': {
    prompt: 'Split the settings screen into one file per section.',
    command: 'pnpm test settings',
    answer: 'Appearance and Notifications are split out. I am moving Privacy next.',
    working: true,
  },
  'demo/p3': {
    prompt: 'Write the install guide for macOS.',
    command: 'ls docs/install',
    answer: 'The macOS page is drafted. The Linux page comes next.',
    working: true,
  },
  'demo/p4': {
    prompt: 'Clean up the lint warnings in the API package.',
    command: 'pnpm lint --fix',
    answer: 'Fixed 14 files. No warnings are left.',
    working: false,
  },
  'demo/p5': {
    prompt: 'Review the dark mode colors on the settings screens.',
    command: 'pnpm test theme',
    answer: 'Every settings screen reads its colors from the theme. Nothing to change.',
    working: false,
  },
  'lab/p1': {
    prompt: 'Warm the render cache before the nightly run.',
    command: 'render warm --shards 8',
    answer: 'Three of eight shards are warm so far.',
    working: true,
  },
  'lab/p2': {
    prompt: 'Review the render queue for stuck jobs.',
    command: 'render queue list',
    answer: 'No stuck jobs. The oldest one has been waiting two minutes.',
    working: false,
  },
};

/**
 * The conversation a demo Agent shows in Chat: a prompt, one command and an answer, so the demo
 * reads like a session. Null for a pane the demo has no conversation for.
 */
export function demoConversation(
  hostId: string,
  paneId: string,
  now: number = Date.now(),
): ConversationState | null {
  const chat = CHATS[`${hostId}/${paneId}`];
  if (!chat) return null;
  const entries: ChatEntry[] = [
    { id: 'u1', sourceOffset: 0, content: { type: 'user', value: userMessage(chat.prompt) } },
    {
      id: 't1',
      sourceOffset: 1,
      content: {
        type: 'tool',
        value: toolActivity({
          kind: 'command',
          name: 'Bash',
          title: chat.command,
          status: 'succeeded',
        }),
      },
    },
    { id: 'a1', sourceOffset: 2, content: { type: 'assistant', value: { text: chat.answer } } },
  ];
  return {
    snapshot: {
      ...initialSnapshot(),
      phase: { type: 'following', path: '/demo/session.jsonl' },
      transcript: {
        ...emptyTranscript(),
        entries,
        turns: [
          {
            firstEntryID: 'u1',
            startedAt: new Date(now - 5 * 60_000).toISOString(),
            endedAt: chat.working ? null : new Date(now - 4 * 60_000).toISOString(),
            ending: chat.working ? null : 'completed',
          },
        ],
      },
    },
    workflowProgress: {},
    outputs: new Map(),
    version: 1,
  };
}
