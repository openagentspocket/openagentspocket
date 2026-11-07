import {
  type ChatTranscript,
  type ConversationState,
  type ConversationStore,
  emptyTranscript,
  initialSnapshot,
  question,
  toolActivity,
} from '@openagentspocket/core';
import { ThemeProvider } from '@openagentspocket/ui';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ConversationRegistry } from '@/conversations/ConversationRegistry';
import { ConversationsProvider } from '@/conversations/useConversation';
import { TestSettings } from '@/settings/TestSettings';
import { type AgentWait, AgentWaitContext } from '../../blocked/BlockedCardProvider';
import { ChatTimeline } from './ChatTimeline';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('expo-clipboard', () => ({ getStringAsync: async () => '' }));

const asked = (answer: string | null = null, isMultiSelect = false) =>
  question({
    text: 'Ship it?',
    options: [
      { label: 'Ship', detail: null },
      { label: 'Hold', detail: 'for review' },
    ],
    isMultiSelect,
    answer,
  });

function transcriptWith(
  status: 'awaitingApproval' | 'succeeded' | 'interrupted',
  questions = [asked()],
): ChatTranscript {
  const value = toolActivity({
    kind: 'question',
    name: 'AskUserQuestion',
    title: 'Ship it?',
    status,
    callID: 'call-1',
  });
  value.questions = questions;
  return {
    ...emptyTranscript(),
    entries: [{ id: 'e1', sourceOffset: 1, content: { type: 'tool', value } }],
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
  } as unknown as ConversationStore;
  return { get: () => store } as unknown as ConversationRegistry;
}

async function renderChat(transcript: ChatTranscript, wait: Partial<AgentWait> = {}) {
  const showTerminal = jest.fn();
  const value: AgentWait = {
    card: null,
    openQuestion: false,
    openCalls: new Set(),
    wait: 'none',
    showTerminal,
    ...wait,
  };
  await render(
    <ThemeProvider themeId="indigo">
      <TestSettings>
        <ConversationsProvider registry={registryOf(transcript)}>
          <AgentWaitContext.Provider value={value}>
            <ChatTimeline
              hostId="demo"
              paneId="p1"
              activity="idle"
              topInset={0}
              bottomInset={0}
              onShowTerminal={jest.fn()}
            />
          </AgentWaitContext.Provider>
        </ConversationsProvider>
      </TestSettings>
    </ThemeProvider>,
  );
  return { showTerminal };
}

const OPEN = { openQuestion: true, openCalls: new Set(['call-1']) };

describe('a question in Chat', () => {
  it('shows what it offers while it waits', async () => {
    await renderChat(transcriptWith('awaitingApproval'), { ...OPEN, wait: 'card' });
    await waitFor(() => expect(screen.getByTestId('chat-questions')).toBeTruthy());
    expect(screen.getByText(/• Ship/)).toBeTruthy();
    expect(screen.getByText(/Hold/)).toBeTruthy();
    expect(screen.getByTestId('tool-status-waiting')).toBeTruthy();
    expect(screen.queryByTestId('chat-question-unread')).toBeNull();
  });

  it('reads as waiting when the row followed an idle herdr', async () => {
    await renderChat(transcriptWith('interrupted'), { ...OPEN, wait: 'card' });
    await waitFor(() => expect(screen.getByTestId('tool-status-waiting')).toBeTruthy());
  });

  it('says so on the row and offers the terminal when the screen cannot be read', async () => {
    const { showTerminal } = await renderChat(transcriptWith('awaitingApproval'), {
      ...OPEN,
      wait: 'terminal',
    });
    await waitFor(() => expect(screen.getByTestId('chat-question-unread')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('chat-question-terminal'));
    expect(showTerminal).toHaveBeenCalledTimes(1);
  });

  it('marks a question that takes several answers', async () => {
    await renderChat(transcriptWith('awaitingApproval', [asked(null, true)]), {
      ...OPEN,
      wait: 'card',
    });
    await waitFor(() => expect(screen.getByText('Pick one or more.')).toBeTruthy());
  });

  it('shows the answer, not the options, once answered, and no terminal offer', async () => {
    const transcript = transcriptWith('succeeded', [asked('Ship')]);
    await renderChat(transcript, { wait: 'terminal' });
    await waitFor(() => expect(screen.getByLabelText('Ship it?')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('Ship it?'));
    await waitFor(() => expect(screen.getByText('Ship')).toBeTruthy());
    expect(screen.queryByText(/Hold/)).toBeNull();
    expect(screen.queryByTestId('chat-question-unread')).toBeNull();
    expect(screen.getByTestId('tool-status-done')).toBeTruthy();
  });

  it('draws the rows a program writes as questions of their own', async () => {
    const transcript: ChatTranscript = {
      ...emptyTranscript(),
      entries: [
        {
          id: 'e1',
          sourceOffset: 1,
          content: { type: 'questions', value: { questions: [asked()] } },
        },
      ],
    };
    await renderChat(transcript, { openQuestion: true, wait: 'card' });
    await waitFor(() => expect(screen.getByTestId('chat-questions')).toBeTruthy());
    expect(screen.getByText('Ship it?')).toBeTruthy();
  });
});
