import {
  type ChatBackgroundWorkItem,
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

/** A finished Subagent's own transcript: its task, a tool call and its answer. */
const subagentTranscript = {
  ...emptyTranscript(),
  entries: [
    {
      id: 's1',
      sourceOffset: 0,
      content: {
        type: 'user' as const,
        value: userMessage('Check whether the screenshots still show the address field.'),
      },
    },
    {
      id: 's2',
      sourceOffset: 1,
      content: {
        type: 'tool' as const,
        value: toolActivity({
          kind: 'search',
          name: 'Grep',
          title: 'Searched for "address field" in docs/guide',
          status: 'succeeded',
        }),
      },
    },
    {
      id: 's3',
      sourceOffset: 2,
      content: {
        type: 'assistant' as const,
        value: {
          text: 'Two screenshots still show the address field: **setup-2.png** and **setup-3.png**.',
        },
      },
    },
  ],
};

const registryFor = (conversation: ConversationState) =>
  ({
    get: () => storeFor(conversation),
    readSubagent: async (_host: string, _pane: string, agentID: string) => ({
      route: {
        agentID,
        path: `/demo/subagents/${agentID}.jsonl`,
        title: 'Check screenshots',
        subtitle: 'general-purpose',
      },
      outcome: { type: 'loaded' as const, transcript: subagentTranscript, isPartial: false },
    }),
  }) as unknown as ConversationRegistry;
const work = (
  id: string,
  title: string,
  options: Partial<ChatBackgroundWorkItem> & { launchedAgo: number },
): ChatBackgroundWorkItem => ({
  id,
  kind: 'subagent',
  title,
  subtitle: null,
  state: 'running',
  journalPath: null,
  launchOffset: 100,
  endOffset: null,
  launchedAt: at(options.launchedAgo),
  endedAt: null,
  usage: null,
  ...options,
});

const usage = (
  fields: Partial<NonNullable<ChatBackgroundWorkItem['usage']>>,
): NonNullable<ChatBackgroundWorkItem['usage']> => ({
  tokens: null,
  toolUses: null,
  durationMilliseconds: null,
  agents: null,
  agentsDone: null,
  agentsFailed: null,
  ...fields,
});

/** Mid-session with Background Work: two running, two finished, one Workflow with its journal. */
const workState: ConversationState = {
  ...state,
  snapshot: {
    ...state.snapshot,
    transcript: {
      ...state.snapshot.transcript,
      latestPromptOffset: 50,
      entries: [
        ...state.snapshot.transcript.entries,
        ...[
          ['w1', 'Find old pairing steps', 'Explore', 'started'],
          ['w3', 'Check screenshots', 'general-purpose', 'succeeded'],
          ['w4', 'Check link anchors', 'Explore', 'succeeded'],
        ].map(([id = '', title = '', kind = '', status = ''], index) => ({
          id,
          sourceOffset: 100 + index,
          content: {
            type: 'tool' as const,
            value: toolActivity({
              kind: 'agent',
              name: 'Task',
              title,
              subtitle: kind,
              status: status as 'started' | 'succeeded',
              subagentAgentID: `a-${id}`,
            }),
          },
        })),
      ],
      backgroundWork: [
        work('w1', 'Find old pairing steps', { subtitle: 'Explore', launchedAgo: 246 }),
        work('w2', 'docs-audit', {
          kind: 'workflow',
          subtitle: 'Check every guide page against the QR code flow',
          launchedAgo: 237,
        }),
        work('w3', 'Check screenshots', {
          subtitle: 'general-purpose',
          state: 'completed',
          launchedAgo: 200,
          endOffset: 120,
          endedAt: at(76),
          usage: usage({ tokens: 41_200, toolUses: 14, durationMilliseconds: 124_000 }),
        }),
        work('w4', 'Check link anchors', {
          subtitle: 'Explore',
          state: 'completed',
          launchedAgo: 150,
          endOffset: 130,
          endedAt: at(79),
          usage: usage({ durationMilliseconds: 71_000 }),
        }),
      ],
    },
  },
  workflowProgress: {
    w2: {
      updatedAt: at(5),
      agents: [
        { id: 'k1', label: 'audit:setup', phase: 'Audit', state: 'done' },
        { id: 'k2', label: 'audit:index', phase: 'Audit', state: 'done' },
        { id: 'k3', label: null, phase: 'Verify', state: 'running' },
      ],
    },
  },
};

/** The Blocked card's screen: one Subagent running, condensed to a line over the card. */
const blockedWorkState: ConversationState = {
  ...state,
  snapshot: {
    ...state.snapshot,
    transcript: {
      ...state.snapshot.transcript,
      backgroundWork: [
        work('w1', 'Find other retry callers', { subtitle: 'Explore', launchedAgo: 30 }),
      ],
    },
  },
};

const registry = registryFor(state);
const workRegistry = registryFor(workState);
const blockedWorkRegistry = registryFor(blockedWorkState);
const lookingRegistry = registryFor(lookingState);

/** Gives the atlas a scripted conversation, so Chat renders as it does mid-session. */
export function AtlasChat({
  children,
  looking = false,
  background,
}: {
  children: ReactNode;
  /** The conversation is still being located and the last read failed (chat-banners). */
  looking?: boolean;
  /** Background Work over the Composer: the strip's list, or the Blocked card's single Subagent. */
  background?: 'list' | 'blocked';
}) {
  const scripted = looking
    ? lookingRegistry
    : background === 'list'
      ? workRegistry
      : background === 'blocked'
        ? blockedWorkRegistry
        : registry;
  return <ConversationsProvider registry={scripted}>{children}</ConversationsProvider>;
}
