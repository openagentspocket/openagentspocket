import {
  type ChatTranscript,
  type ConversationState,
  type ConversationStore,
  emptyTranscript,
  initialSnapshot,
} from '@openagentspocket/core';
import { ThemeProvider } from '@openagentspocket/ui';
import { render, screen, waitFor } from '@testing-library/react-native';
import type { ConversationRegistry } from '@/conversations/ConversationRegistry';
import { ConversationsProvider } from '@/conversations/useConversation';
import { ChatTimeline } from './ChatTimeline';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('expo-clipboard', () => ({ getStringAsync: async () => '' }));

// Jest runs in node; the app's tsconfig carries no node typings.
declare const __dirname: string;
const { readFileSync } = require('node:fs') as {
  readFileSync(path: string, encoding: 'utf8'): string;
};
const GOLDENS = `${__dirname}/../../../../../packages/core/goldens`;

/** The program's own projected conversation (Swift golden, idle), read back as a ChatTranscript. */
function transcriptOf(path: string): ChatTranscript {
  const image = JSON.parse(readFileSync(`${GOLDENS}/${path}`, 'utf8')).projections.idle;
  return {
    ...emptyTranscript(),
    ...image,
    entries: image.entries.map(
      (entry: { id: string; sourceOffset: number; content: Record<string, unknown> }) => {
        const [type, value] = Object.entries(entry.content)[0] as [string, unknown];
        return { id: entry.id, sourceOffset: entry.sourceOffset, content: { type, value } };
      },
    ),
    diagnostics: { ...image.diagnostics, unknownRecordTypes: new Set() },
    unrecordedEntryIDs: new Set(image.unrecordedEntryIDs),
  };
}

function registryOf(transcript: ChatTranscript): ConversationRegistry {
  const state: ConversationState = {
    snapshot: {
      ...initialSnapshot(),
      phase: { type: 'following', path: '/demo/session' },
      transcript,
    },
    workflowProgress: {},
    outputs: new Map(),
    version: 1,
  };
  const store = {
    subscribe: () => () => undefined,
    getState: () => state,
    show: () => undefined,
    hide: () => undefined,
    loadOlder: () => undefined,
    loadOutput: () => undefined,
    retry: () => undefined,
  } as unknown as ConversationStore;
  return { get: () => store } as unknown as ConversationRegistry;
}

// Each program's conversation goes through the same Chat timeline: no screen knows the program.
describe.each([
  ['Pi', 'pi/transcripts/summaries.golden.json'],
  ['Oh My Pi', 'omp/transcripts/approvals-asks-plan.golden.json'],
  ['Grok Build', 'grok/transcripts/core-turns.golden.json'],
  ['OpenCode', 'opencode/transcripts/rows-pong.golden.json'],
])('Chat timeline with %s', (_name, golden) => {
  it('draws the conversation rows', async () => {
    const transcript = transcriptOf(golden);
    expect(transcript.entries.length).toBeGreaterThan(1);
    await render(
      <ThemeProvider themeId="indigo">
        <ConversationsProvider registry={registryOf(transcript)}>
          <ChatTimeline
            hostId="demo"
            paneId="p1"
            activity="idle"
            topInset={0}
            bottomInset={0}
            onShowTerminal={jest.fn()}
          />
        </ConversationsProvider>
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getAllByTestId(/^chat-row-/).length).toBeGreaterThan(0));
  });
});
