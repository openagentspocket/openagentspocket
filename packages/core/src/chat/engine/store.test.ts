import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../hosts/cancellation';
import type { AgentSessionInfo } from '../../protocol/herdr-types.generated';
import { VolatileChatTranscriptCache } from '../model/cache';
import { FakeHostFiles } from '../model/fake-host-files';
import {
  assistantLine,
  bashLine,
  CWD,
  conversation,
  resultLine,
  SESSION,
  toText,
  userLine,
  writeClaude,
} from './fixtures.testkit';
import { ConversationStore } from './store';
import type { ChatAgentView } from './store-types';

const claudeSession = (value = SESSION): AgentSessionInfo => ({
  agent: 'claude',
  kind: 'id',
  source: 'herdr:claude',
  value,
});

function setup(initial: Partial<ChatAgentView> = {}) {
  const files = new FakeHostFiles();
  const clock = new FakeClock(() => new Promise((resolve) => setImmediate(resolve)));
  const cache = new VolatileChatTranscriptCache();
  let view: ChatAgentView | undefined = {
    program: 'claude',
    activity: 'idle',
    cwd: CWD,
    foregroundCwd: null,
    session: claudeSession(),
    ...initial,
  };
  const store = new ConversationStore({
    hostId: 'h1',
    herdrSession: '',
    agent: () => view,
    files,
    cache,
    clock,
    now: () => clock.now,
  });
  return {
    files,
    clock,
    cache,
    store,
    setView: (next: ChatAgentView | undefined) => {
      view = next;
    },
  };
}

const entryCount = (store: ConversationStore) =>
  store.getState().snapshot.transcript.entries.length;

describe('ConversationStore', () => {
  it('shows why when herdr reports no session, then follows once it does', async () => {
    const { store, setView, files } = setup({ session: null });
    await store.step();
    expect(store.getState().snapshot.phase).toEqual({
      type: 'unavailable',
      reason: { kind: 'noSession', program: 'claude' },
    });
    writeClaude(files, conversation(1));
    setView({
      program: 'claude',
      activity: 'idle',
      cwd: CWD,
      foregroundCwd: null,
      session: claudeSession(),
    });
    await store.step();
    expect(store.getState().snapshot.phase.type).toBe('following');
    expect(entryCount(store)).toBe(2);
  });

  it('rejects a session of another program or a malformed id', async () => {
    const other = setup({
      session: { agent: 'pi', kind: 'id', source: 'herdr:pi', value: SESSION },
    });
    await other.store.step();
    expect(other.store.getState().snapshot.phase).toMatchObject({
      reason: { kind: 'unsupportedSession' },
    });
    const bad = setup({ session: claudeSession('not-an-id') });
    await bad.store.step();
    expect(bad.store.getState().snapshot.phase).toMatchObject({
      reason: { kind: 'unidentifiedSession' },
    });
  });

  it('polls appended lines and notifies subscribers once per change', async () => {
    const { store, files } = setup();
    const path = writeClaude(files, conversation(1));
    let notified = 0;
    store.subscribe(() => {
      notified += 1;
    });
    await store.step();
    files.append(path, toText(conversation(1, 2)));
    await store.step();
    expect(entryCount(store)).toBe(4);
    const settled = store.getState().version;
    await store.step();
    expect(store.getState().version).toBe(settled);
    expect(notified).toBeGreaterThan(0);
  });

  it('backs off between searches for a missing transcript and looks at once on retry', async () => {
    const { store, files, clock } = setup();
    files.mkdir(`${files.homePath}/.claude/projects`);
    await store.step();
    expect(store.getState().snapshot.phase).toMatchObject({ reason: { kind: 'notFound' } });
    writeClaude(files, conversation(1));
    await store.step();
    // The backoff has not elapsed: still unavailable, no new search.
    expect(store.getState().snapshot.phase.type).toBe('unavailable');
    // Retry clears the backoff.
    store.retry();
    await store.step();
    expect(store.getState().snapshot.phase.type).toBe('following');
  });

  it('looks again by itself once the backoff has elapsed', async () => {
    const { store, files, clock } = setup();
    files.mkdir(`${files.homePath}/.claude/projects`);
    await store.step();
    writeClaude(files, conversation(1));
    await clock.advance(2500);
    await store.step();
    expect(store.getState().snapshot.phase.type).toBe('following');
  });

  it('starts over on another conversation when herdr reports a new session', async () => {
    const { store, files, setView } = setup();
    writeClaude(files, conversation(1));
    await store.step();
    expect(entryCount(store)).toBe(2);
    const second = '9a8b7c6d-1111-4222-8333-444455556666';
    setView({
      program: 'claude',
      activity: 'idle',
      cwd: CWD,
      foregroundCwd: null,
      session: claudeSession(second),
    });
    await store.step();
    expect(store.getState().snapshot.transcript.entries).toEqual([]);
    expect(store.getState().snapshot.phase.type).not.toBe('following');
  });

  it('restores the device copy first on a later visit', async () => {
    const first = setup();
    writeClaude(first.files, conversation(2));
    await first.store.step();
    first.store.show();
    first.store.hide();
    await first.clock.flush();
    const files = first.files;
    const later = new ConversationStore({
      hostId: 'h1',
      herdrSession: '',
      agent: () => ({
        program: 'claude',
        activity: 'idle',
        cwd: CWD,
        foregroundCwd: null,
        session: claudeSession(),
      }),
      files,
      cache: first.cache,
      clock: first.clock,
      now: () => first.clock.now,
    });
    files.failing.add(`${files.homePath}/.claude`);
    await later.step();
    expect(later.getState().snapshot.transcript.entries.length).toBe(4);
  });

  it('runs a loop while shown, faster while the Agent works', async () => {
    const { store, files, clock, setView } = setup({ activity: 'working' });
    const path = writeClaude(files, conversation(1));
    store.show();
    await clock.advance(0);
    expect(entryCount(store)).toBe(2);
    files.append(path, toText(conversation(1, 2)));
    await clock.advance(1000);
    expect(entryCount(store)).toBe(4);
    expect(store.interval).toBe(1000);
    setView({
      program: 'claude',
      activity: 'idle',
      cwd: CWD,
      foregroundCwd: null,
      session: claudeSession(),
    });
    await clock.advance(1000);
    await clock.advance(20_000);
    expect(store.interval).toBe(4000);
    store.hide();
  });

  it('reads an expanded tool output once the transcript is open', async () => {
    const { store, files } = setup();
    writeClaude(files, [
      userLine('u1', null, 'list'),
      bashLine('a1', 'u1', 'toolu_1'),
      resultLine('r1', 'a1', 'toolu_1', 'file-one'),
      assistantLine('a2', 'r1', 'done'),
    ]);
    await store.step();
    const row = store.getState().snapshot.transcript.entries.find((e) => e.content.type === 'tool');
    if (!row) throw new Error('no tool row');
    store.loadOutput(row.id);
    expect(store.getState().outputs.get(row.id)).toEqual({ type: 'loading' });
    await new Promise((resolve) => setImmediate(resolve));
    const state = store.getState().outputs.get(row.id);
    expect(state?.type).toBe('loaded');
  });

  it('waits to read an output while the Host is not connected', async () => {
    const { store, files } = setup();
    writeClaude(files, [
      userLine('u1', null, 'list'),
      bashLine('a1', 'u1', 'toolu_1'),
      resultLine('r1', 'a1', 'toolu_1', 'file-one'),
    ]);
    await store.step();
    store.hostConnectionChanged(false);
    const row = store.getState().snapshot.transcript.entries.find((e) => e.content.type === 'tool');
    if (!row) throw new Error('no tool row');
    store.loadOutput(row.id);
    expect(store.getState().outputs.has(row.id)).toBe(false);
    store.hostConnectionChanged(true);
    await new Promise((resolve) => setImmediate(resolve));
    expect(store.getState().outputs.get(row.id)?.type).toBe('loaded');
  });
});
