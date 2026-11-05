import {
  type ChatEntry,
  type ConversationState,
  type ConversationStore,
  divider,
  emptyTranscript,
  initialSnapshot,
  toolActivity,
  userMessage,
} from '@openagentspocket/core';
import type { ReactNode } from 'react';
import type { ConversationRegistry } from '@/conversations/ConversationRegistry';
import { ConversationsProvider } from '@/conversations/useConversation';
import { ATLAS_NOW } from './atlasClock';

const at = (secondsAgo: number) => new Date(ATLAS_NOW - secondsAgo * 1000).toISOString();

const ENTRIES: ChatEntry[] = [
  {
    id: 'u1',
    sourceOffset: 0,
    content: {
      type: 'user',
      value: userMessage(
        'The Attach toolbar feels crowded on small phones. Can you tighten it up without hiding anything people use often?',
      ),
    },
  },
  {
    id: 'r1',
    sourceOffset: 1,
    content: {
      type: 'reasoning',
      value: {
        text: 'Checking which controls the bar shows at each width.',
        durationMilliseconds: 4000,
      },
    },
  },
  {
    id: 't1',
    sourceOffset: 2,
    content: {
      type: 'tool',
      value: toolActivity({
        kind: 'command',
        name: 'Bash',
        title: 'swift test --filter AttachViewTests',
        status: 'succeeded',
      }),
    },
  },
  {
    id: 'a1',
    sourceOffset: 3,
    content: {
      type: 'assistant',
      value: {
        text: [
          'The toolbar now fits on the smallest phones.',
          '',
          '- **Send** and **Keys** stay in the bar at every width.',
          '- **Paste**, **Snippets** and **Clear** move into a **More** menu when the bar runs out of room.',
          '- Wider screens keep every control in the bar, as before.',
          '',
          '`AttachViewTests` passes (24 tests).',
        ].join('\n'),
      },
    },
  },
  { id: 'd1', sourceOffset: 4, content: { type: 'divider', value: divider('compaction') } },
  {
    id: 'u2',
    sourceOffset: 5,
    content: {
      type: 'user',
      value: userMessage('Now check the toolbar at the largest text size.'),
    },
  },
  {
    id: 'r2',
    sourceOffset: 6,
    content: {
      type: 'reasoning',
      value: {
        text: 'Running the snapshot tests at the accessibility sizes.',
        durationMilliseconds: 4000,
      },
    },
  },
  {
    id: 't2',
    sourceOffset: 7,
    content: {
      type: 'tool',
      value: toolActivity({
        kind: 'command',
        name: 'Bash',
        title: 'swift test --filter AttachToolbarSnapshotTests',
        status: 'failed',
        exitCode: 1,
      }),
    },
  },
  {
    id: 'a2',
    sourceOffset: 8,
    content: {
      type: 'assistant',
      value: {
        text: "At the largest size the **More** label wraps. I'm switching it to an icon in that layout and running the snapshots again.",
      },
    },
  },
];

const state: ConversationState = {
  snapshot: {
    ...initialSnapshot(),
    phase: { type: 'following', path: '/demo/session.jsonl' },
    transcript: {
      ...emptyTranscript(),
      entries: ENTRIES,
      turns: [
        { firstEntryID: 'u1', startedAt: at(600), endedAt: at(574), ending: 'completed' },
        { firstEntryID: 'u2', startedAt: at(105), endedAt: null, ending: null },
      ],
    },
  },
  workflowProgress: {},
  outputs: new Map(),
  version: 1,
};

/** Searching for the transcript with a failed read: the read-failure line over the centered wait. */
const lookingState: ConversationState = {
  ...state,
  snapshot: {
    ...initialSnapshot(),
    phase: { type: 'locating' },
    readFailure: { kind: 'timedOut' },
  },
};

const storeFor = (conversation: ConversationState) =>
  ({
    subscribe: () => () => undefined,
    getState: () => conversation,
    show: () => undefined,
    hide: () => undefined,
    loadOlder: () => undefined,
    loadOutput: () => undefined,
    retry: () => undefined,
  }) as unknown as ConversationStore;

const registryFor = (conversation: ConversationState) =>
  ({ get: () => storeFor(conversation) }) as unknown as ConversationRegistry;
const registry = registryFor(state);
const lookingRegistry = registryFor(lookingState);

/** Gives the atlas a scripted conversation, so Chat renders as it does mid-session. */
export function AtlasChat({
  children,
  looking = false,
}: {
  children: ReactNode;
  /** The conversation is still being located and the last read failed (chat-banners). */
  looking?: boolean;
}) {
  return (
    <ConversationsProvider registry={looking ? lookingRegistry : registry}>
      {children}
    </ConversationsProvider>
  );
}
