import '../programs';
import { describe, expect, it } from 'vitest';
import { decodeAnsiScreen } from '../../blocked/ansi-decoder';
import { FakeClock } from '../../hosts/cancellation';
import type { AgentSessionInfo } from '../../protocol/herdr-types.generated';
import { VolatileChatTranscriptCache } from '../model/cache';
import { FakeHostFiles } from '../model/fake-host-files';
import { CWD, conversation, SESSION, toText, userLine, writeClaude } from './fixtures.testkit';
import { ConversationStore } from './store';
import type { ChatAgentView } from './store-types';

const session: AgentSessionInfo = {
  agent: 'claude',
  kind: 'id',
  source: 'herdr:claude',
  value: SESSION,
};

function setup(activity: ChatAgentView['activity'] = 'idle') {
  const files = new FakeHostFiles();
  const clock = new FakeClock(() => new Promise((resolve) => setImmediate(resolve)));
  let view: ChatAgentView = { program: 'claude', activity, cwd: CWD, foregroundCwd: null, session };
  const store = new ConversationStore({
    hostId: 'h1',
    herdrSession: '',
    agent: () => view,
    files,
    cache: new VolatileChatTranscriptCache(),
    clock,
    now: () => 1_000_000 + clock.now,
    readScreen: async () => decodeAnsiScreen(''),
  });
  return {
    files,
    clock,
    store,
    setActivity: (next: ChatAgentView['activity']) => (view = { ...view, activity: next }),
  };
}

const status = (store: ConversationStore, id: string) =>
  store.getState().sendStatuses?.get(id)?.kind;

describe('ConversationStore sends', () => {
  it('follows a message Chat sent until the transcript records it', async () => {
    const { files, store } = setup();
    const path = writeClaude(files, conversation(1));
    await store.step();
    expect(store.getState().sendStatuses).toBeUndefined();

    store.updateSends([{ id: 'm1', text: 'fix the tests ', isDelivered: false }]);
    expect(status(store, 'm1')).toBe('awaiting');
    store.updateSends([{ id: 'm1', text: 'fix the tests ', isDelivered: true }]);
    expect(status(store, 'm1')).toBe('awaiting');

    files.append(path, toText([userLine('u9', 'a1', 'fix the tests')]));
    await store.step();
    expect(status(store, 'm1')).toBe('recorded');
  });

  it('counts only a prompt recorded after the send', async () => {
    const { files, store } = setup();
    writeClaude(files, [...conversation(1), userLine('u5', 'a1', 'fix the tests')]);
    await store.step();
    store.updateSends([{ id: 'm1', text: 'fix the tests ', isDelivered: true }]);
    // First seen already delivered: the Composer held it before Chat was watching.
    expect(status(store, 'm1')).toBe('abandoned');
  });

  it('notifies subscribers when a status changes', async () => {
    const { files, store } = setup();
    writeClaude(files, conversation(1));
    await store.step();
    let notified = 0;
    store.subscribe(() => {
      notified += 1;
    });
    store.updateSends([{ id: 'm1', text: 'hello ', isDelivered: false }]);
    expect(notified).toBeGreaterThan(0);
    expect(store.getState().sendStatuses?.get('m1')).toEqual({ kind: 'awaiting' });
  });

  it('answers the send concern and the input-box read without a tracker as nothing to hold', () => {
    const { store } = setup();
    expect(store.sendConcern('hello', decodeAnsiScreen(''))).toBeNull();
    expect(() => store.inputBoxWasRead(decodeAnsiScreen(''))).not.toThrow();
  });
});
