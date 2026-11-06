// The session half of the conversation store (Swift OpenCodeChatStoreTests, ADR 0025): after `/new`
// OpenCode's home screen leaves herdr reporting the conversation it left, so the store watches the
// start screen and checks herdr's record and the terminal title before each send.

import { describe, expect, it } from 'vitest';
import { screenFixtures } from '../../blocked/golden-fixtures.testkit';
import type { AnsiScreen } from '../../blocked/screen';
import { encodeUtf8 } from '../../events/utf8';
import { FakeClock } from '../../hosts/cancellation';
import { VolatileChatTranscriptCache } from '../model/cache';
import { FakeHostFiles } from '../model/fake-host-files';
import type { ChatHostFiles } from '../model/host-files';
import type { OpenCodeQueryResponse } from '../opencode/query';
import { ConversationStore } from './store';
import type { ChatAgentView } from './store-types';

const APPLE = 'ses_0a1b2c3d4e5fK2mN8pQ4rT6vX9';
const OTHER = 'ses_0a1b2c3d4e6aW3nT9cXq2LmB8v';
const TITLES: Record<string, string> = { [APPLE]: 'Apple', [OTHER]: 'Other secret title' };
const SESSION_SCREEN = 'opencode-02-session-empty-180';
const HOME_SCREEN = 'opencode-18-home-after-new-180';
const EPOCH = 1_800_000_000_000;
const screens = new Map(
  screenFixtures('opencode').map((fixture) => [fixture.name, fixture.screen]),
);

const view = (
  session: string,
  title: string | null,
  options: { activity?: ChatAgentView['activity']; program?: ChatAgentView['program'] } = {},
): ChatAgentView => {
  const program = options.program ?? 'opencode';
  return {
    program,
    activity: options.activity ?? 'idle',
    cwd: '/home/dev/proj',
    foregroundCwd: null,
    terminalTitle: title,
    session: { agent: program, kind: 'id', source: `herdr:${program}`, value: session },
  };
};

function records(session: string, title: string): OpenCodeQueryResponse {
  const line = `{"k":"row","id":"msg_1","type":"user","seq":1,"tc":${EPOCH},"tu":${EPOCH},"f":true,"d":{"text":"hi","n":2,"files":[],"agents":[]}}`;
  return {
    type: 'records',
    records: {
      sqliteVersion: '3.51.0',
      eventSeq: 4,
      generation: null,
      sessionLine: encodeUtf8(
        `{"k":"session","id":"${session}","parent":null,"title":${JSON.stringify(title)},"version":"2.0.32"}`,
      ),
      inboxLine: encodeUtf8('{"k":"inbox","items":[],"more":0}'),
      rows: [{ id: 'msg_1', seq: 1, timeUpdated: EPOCH, isFinal: true, line: encodeUtf8(line) }],
      firstSeq: 1,
      windowCount: null,
      overflow: false,
      ignoredLines: 0,
    },
  };
}

function setup(
  options: {
    appleTitle?: string;
    terminalTitle?: string | null;
    program?: ChatAgentView['program'];
  } = {},
) {
  const { program = 'opencode' } = options;
  const titles: Record<string, string> = { ...TITLES, [APPLE]: options.appleTitle ?? 'Apple' };
  let queries = 0;
  const refuse = async (): Promise<never> => {
    throw new Error('no files');
  };
  const files: ChatHostFiles =
    program === 'opencode'
      ? {
          status: refuse,
          list: refuse,
          read: refuse,
          home: refuse,
          queryStore: async (_store, { session, query }) => {
            queries += 1;
            return query.kind === 'tail'
              ? records(session, titles[session] ?? '')
              : { type: 'unchanged', eventSeq: 4 };
          },
        }
      : new FakeHostFiles();
  let nowMs = 1_000_000;
  let screen: AnsiScreenOrNull = screens.get(SESSION_SCREEN) as AnsiScreen;
  let screenReads = 0;
  let server = view(
    APPLE,
    options.terminalTitle === undefined ? 'OC | Apple' : options.terminalTitle,
    {
      program,
    },
  );
  let console = server;
  let recordFailure = false;
  const store = new ConversationStore({
    hostId: 'h1',
    herdrSession: '',
    agent: () => console,
    files,
    cache: new VolatileChatTranscriptCache(),
    clock: new FakeClock(() => new Promise((resolve) => setImmediate(resolve))),
    now: () => nowMs,
    readScreen: async () => {
      screenReads += 1;
      return screen as AnsiScreen;
    },
    agentInfo: async () => {
      if (recordFailure) throw new Error('lost');
      return server;
    },
  });
  store.show();
  store.suspend();
  const api = {
    store,
    phase: () => store.getState().snapshot.phase,
    queries: () => queries,
    screenReads: () => screenReads,
    show: (stem: string) => {
      screen = screens.get(stem) as AnsiScreen;
    },
    /** What herdr answers to `agent.get` from now on, with the Console's record unchanged. */
    answer: (next: ChatAgentView) => {
      server = next;
    },
    /** What herdr answers and the Console now shows too. */
    report: (
      session: string,
      title: string | null,
      activity: ChatAgentView['activity'] = 'idle',
    ) => {
      server = view(session, title, { activity, program });
      console = server;
    },
    failRecord: () => {
      recordFailure = true;
    },
    /** The next turn, once the screen watch is due again. */
    recheck: async () => {
      nowMs += 5000;
      await store.step();
    },
    leaveForHome: async (from = APPLE) => {
      api.show(HOME_SCREEN);
      api.report(from, 'OpenCode');
      await api.recheck();
    },
  };
  return api;
}

type AnsiScreenOrNull = AnsiScreen | undefined;
const following = (session: string) => ({ type: 'following', path: `opencode:${session}` });
const START_SCREEN = { type: 'unavailable', reason: { kind: 'startScreen', program: 'opencode' } };

describe('before a send', () => {
  it('is refused when herdr now reports another session', async () => {
    const chat = setup();
    await chat.store.step();
    expect(chat.phase()).toEqual(following(APPLE));
    chat.answer(view(OTHER, 'OC | Other secret title'));
    expect(await chat.store.confirmSessionBeforeSend()).toBe(
      'herdr now reports another OpenCode conversation for this Agent. Chat is switching to it; check it, then send again.',
    );
    await chat.store.step();
    expect(chat.phase()).toEqual(following(OTHER));
  });

  it('is refused when the terminal title names another conversation', async () => {
    const chat = setup();
    await chat.store.step();
    chat.answer(view(APPLE, 'OC | Other secret title'));
    expect(await chat.store.confirmSessionBeforeSend()).toBe(
      "OpenCode's terminal shows another conversation (Other secret title). Open this one in the terminal, then send again.",
    );
  });

  it.each([['OC | Apple'], ['OpenCode'], [null]])('goes when the title is %s', async (title) => {
    const chat = setup();
    await chat.store.step();
    chat.answer(view(APPLE, title));
    expect(await chat.store.confirmSessionBeforeSend()).toBeNull();
  });

  it('is refused when the record cannot be read', async () => {
    const chat = setup();
    await chat.store.step();
    chat.failRecord();
    expect(await chat.store.confirmSessionBeforeSend()).toBe(
      "Agentico couldn't check which conversation OpenCode shows, so it sent nothing. Try again.",
    );
  });
});

describe('the start-screen watch', () => {
  it('marks the reported session stale when the home screen shows, and stops reading it', async () => {
    const chat = setup();
    await chat.store.step();
    expect(chat.phase()).toEqual(following(APPLE));
    await chat.leaveForHome();
    expect(chat.phase()).toEqual(START_SCREEN);
    const queries = chat.queries();
    await chat.recheck();
    await chat.recheck();
    expect(chat.queries()).toBe(queries);
    expect(await chat.store.confirmSessionBeforeSend()).toBe(
      "OpenCode is on its home screen, so this conversation isn't open there. Open it in the terminal first.",
    );
  });

  it('stays stale while herdr repeats the session, without reading the screen again', async () => {
    const chat = setup();
    await chat.store.step();
    await chat.leaveForHome();
    const reads = chat.screenReads();
    await chat.recheck();
    chat.report(APPLE, 'OpenCode');
    await chat.store.step();
    await chat.recheck();
    expect(chat.phase()).toEqual(START_SCREEN);
    expect(chat.screenReads()).toBe(reads);
  });

  it('clears when herdr reports another session', async () => {
    const chat = setup();
    await chat.store.step();
    await chat.leaveForHome();
    chat.show(SESSION_SCREEN);
    chat.report(OTHER, 'OC | Other secret title');
    await chat.recheck();
    expect(chat.phase()).toEqual(following(OTHER));
    expect(chat.store.getState().snapshot.transcript.title).toBe('Other secret title');
  });

  it('clears on returning to the same titled conversation, after one screen read', async () => {
    const chat = setup();
    await chat.store.step();
    await chat.leaveForHome();
    const reads = chat.screenReads();
    await chat.recheck();
    expect(chat.screenReads()).toBe(reads);
    chat.show(SESSION_SCREEN);
    chat.report(APPLE, 'OC | Apple');
    await chat.recheck();
    expect(chat.phase()).toEqual(following(APPLE));
    expect(chat.screenReads()).toBe(reads + 1);
  });

  it('clears an untitled conversation only by a report or Retry on a session screen', async () => {
    const chat = setup({
      appleTitle: 'New session - 2026-10-20T08:15:30.123Z',
      terminalTitle: 'OpenCode',
    });
    await chat.store.step();
    expect(chat.store.getState().snapshot.transcript.title).toBeNull();
    await chat.leaveForHome();
    expect(chat.phase()).toEqual(START_SCREEN);
    chat.show(SESSION_SCREEN);
    const reads = chat.screenReads();
    await chat.recheck();
    await chat.recheck();
    expect(chat.phase()).toEqual(START_SCREEN);
    expect(chat.screenReads()).toBe(reads);
    chat.store.retry();
    await chat.store.step();
    expect(chat.phase()).toEqual(following(APPLE));
  });

  it('keeps the mark when Retry finds the home screen, and clears it once a session shows', async () => {
    const chat = setup();
    await chat.store.step();
    await chat.leaveForHome();
    const reads = chat.screenReads();
    chat.store.retry();
    await chat.store.step();
    expect(chat.phase()).toEqual(START_SCREEN);
    expect(chat.screenReads()).toBe(reads + 1);
    chat.show(SESSION_SCREEN);
    chat.store.retry();
    await chat.store.step();
    expect(chat.phase()).toEqual(following(APPLE));
    expect(chat.screenReads()).toBe(reads + 2);
  });

  it('skips the screen read for an exact title and reads it for a prefix or another title', async () => {
    const chat = setup();
    await chat.store.step();
    // The first turn has no title to compare with yet, so it looks once.
    expect(chat.screenReads()).toBe(1);
    for (let turn = 0; turn < 3; turn += 1) await chat.recheck();
    expect(chat.screenReads()).toBe(1);
    chat.report(APPLE, 'OC | Appl');
    await chat.recheck();
    chat.report(APPLE, 'OC | Settings');
    await chat.recheck();
    expect(chat.screenReads()).toBe(3);
    expect(chat.phase()).toEqual(following(APPLE));
  });
});

describe('a program that reports every session', () => {
  it('never looks for the start screen and confirms nothing before a send', async () => {
    const chat = setup({ program: 'claude' });
    for (let turn = 0; turn < 3; turn += 1) await chat.recheck();
    chat.store.retry();
    await chat.store.step();
    expect(chat.screenReads()).toBe(0);
    expect(await chat.store.confirmSessionBeforeSend()).toBeNull();
  });
});
