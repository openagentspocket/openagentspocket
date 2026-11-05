import { describe, expect, it } from 'vitest';
import { type ChatAgentActivity, type ChatTranscript, emptyTranscript } from '../model/types';
import type { SessionCheckInput } from '../send/policy';
import { readGrokScreen } from './screen';
import { capture, grokScreen } from './screen.testkit';
import {
  GROK_AGENT_VIEW_REASON,
  GROK_SESSION_LINE_REASON,
  GROK_UNKNOWN_PROMPT_REASON,
  GROK_WELCOME_REASON,
  grokSessionVerdict,
} from './session-check';

const BOUND = '01900000-0000-7000-8000-000000000004';
const OTHER = '01900000-0000-7000-8000-000000000054';

function transcript(prompts: string[], needsOlderHistory = false): ChatTranscript {
  const recorded = prompts.map((text, index) => ({
    offset: index * 1000,
    text,
    entryID: `grok:${index * 1000}`,
    pastedImagePaths: null,
  }));
  return {
    ...emptyTranscript(),
    needsOlderHistory,
    recordedPrompts: recorded,
    latestPromptOffset: recorded.at(-1)?.offset ?? null,
    turns: recorded.map((prompt) => ({
      firstEntryID: prompt.entryID,
      startedAt: null,
      endedAt: null,
      ending: null,
    })),
  };
}

const KIWI = transcript(['Reply with exactly the word pong.', 'Reply with the word kiwi.']);

function input(
  over: Partial<{
    transcript: ChatTranscript;
    session: string;
    activity: ChatAgentActivity;
    polledSinceIdle: boolean;
    unrecorded: string[];
    misdirected: string[];
  }> = {},
): SessionCheckInput {
  return {
    sessionID: over.session ?? BOUND,
    transcript: over.transcript ?? KIWI,
    activity: over.activity ?? 'idle',
    polledSinceIdle: over.polledSinceIdle ?? true,
    unrecordedSendKeys: new Set(over.unrecorded ?? []),
    misdirectedSendKeys: new Set(over.misdirected ?? []),
  };
}

const screen = (rows: string[], columns = 120) => grokScreen({ columns, scrollback: rows });
const other = (reason: string) => ({ kind: 'otherSession', reason });
const THIS = { kind: 'thisSession' };
const UNKNOWN = { kind: 'unknown' };

describe('Grok Build session check', () => {
  it.each([
    ['grok-17-session-new', '01900000-0000-7000-8000-000000000009'],
    ['grok-18-session-fork', '01900000-0000-7000-8000-000000000001'],
  ])('holds when the session line of %s names another session', (stem, session) => {
    const checked = input({ transcript: transcript(['Reply with exactly: two.']), session });
    expect(grokSessionVerdict(capture(stem), checked)).toEqual(other(GROK_SESSION_LINE_REASON));
  });

  it('passes the session herdr follows', () => {
    const created = capture('grok-17-session-new');
    expect(readGrokScreen(created).sessionLine?.sessionID).toBe(
      '01900000-0000-7000-8000-000000000001',
    );
    expect(
      grokSessionVerdict(
        created,
        input({ transcript: transcript([]), session: '01900000-0000-7000-8000-000000000001' }),
      ),
    ).toEqual(UNKNOWN);
    const fork = capture('grok-18-session-fork');
    expect(readGrokScreen(fork).sessionLine?.sessionID).toBe(
      '01900000-0000-7000-8000-000000000002',
    );
    expect(
      grokSessionVerdict(
        fork,
        input({
          transcript: transcript(['Reply with exactly: two.']),
          session: '01900000-0000-7000-8000-000000000002',
        }),
      ),
    ).toEqual(THIS);
  });

  it('matches a session line wrapped at forty columns', () => {
    const created = screen(
      [
        'Session 01900000-0000-7000-8000-',
        '000000000054, use /dashboard to',
        'switch between sessions',
        '',
      ],
      40,
    );
    const fork = screen(
      [
        'Session 01900000-0000-7000-8000-',
        '000000000054 (forked from',
        '01900000-0000-7000-8000-',
        '000000000004), use /dashboard to',
        'switch between sessions',
        '  (both agents share cwd)',
        '',
      ],
      40,
    );
    for (const wrapped of [created, fork]) {
      expect(readGrokScreen(wrapped).sessionLine?.sessionID).toBe(OTHER);
      expect(grokSessionVerdict(wrapped, input())).toEqual(other(GROK_SESSION_LINE_REASON));
    }
  });

  it('ignores a session id in assistant text', () => {
    const text = screen([
      '❯ Reply with the word kiwi.',
      '',
      `Session ${OTHER} was created yesterday.`,
      `${OTHER}, use /dashboard to switch between sessions`,
      '',
      'Worked for 3.4s',
    ]);
    expect(readGrokScreen(text).sessionLine).toBeNull();
    expect(grokSessionVerdict(text, input())).toEqual(THIS);
  });

  it('holds on a session line whatever messages follow it', () => {
    const after = screen([
      `Session ${OTHER}, use /dashboard to switch between sessions`,
      '',
      '❯ Reply with the word kiwi.',
      '',
      'kiwi',
      '',
      'Worked for 3.4s',
    ]);
    expect(grokSessionVerdict(after, input())).toEqual(other(GROK_SESSION_LINE_REASON));
  });

  it('holds a visible prompt this conversation lacks, and passes the newest recorded one', () => {
    const resumed = capture('grok-19-resumed-other');
    expect(
      readGrokScreen(resumed)
        .userRows.at(-1)
        ?.text.startsWith('Reply with just the word big. Ignore the filler'),
    ).toBe(true);
    expect(
      grokSessionVerdict(
        resumed,
        input({ transcript: transcript(['Reply with exactly the word pong.']) }),
      ),
    ).toEqual(other(GROK_UNKNOWN_PROMPT_REASON));
    expect(
      grokSessionVerdict(screen(['❯ Reply with the word kiwi.', '', 'kiwi']), input()),
    ).toEqual(THIS);
    expect(
      grokSessionVerdict(screen(['❯ Reply with exactly the word pong.', '', 'pong']), input()),
    ).toEqual(UNKNOWN);
  });

  it('says nothing before the reading is complete', () => {
    const newest = screen(['❯ Reply with the word kiwi.', '', 'kiwi']);
    expect(grokSessionVerdict(newest, input({ polledSinceIdle: false }))).toEqual(UNKNOWN);
    expect(grokSessionVerdict(newest, input({ activity: 'working' }))).toEqual(UNKNOWN);
    expect(
      grokSessionVerdict(newest, input({ unrecorded: ['Reply with the word kiwi. '] })),
    ).toEqual(UNKNOWN);
    expect(
      grokSessionVerdict(newest, input({ misdirected: ['Reply with the word kiwi.'] })),
    ).toEqual(UNKNOWN);
  });

  it.each(['❯ /compact', '❯ !ls', '❯ [Pasted text #1 +5 lines]', '❯ [Image #1]'])(
    'says nothing of the command, chip or shell row %s',
    (row) => {
      expect(grokSessionVerdict(screen([row]), input())).toEqual(UNKNOWN);
    },
  );

  it('strips both timestamp formats and the scrollbar from a user row', () => {
    for (const row of [
      '❯ Reply with the word kiwi.                     3:42 PM',
      '❯ Reply with the word kiwi.                     03:42:10 | Nov 5',
      '❯ Reply with the word kiwi.                  █',
    ]) {
      expect(readGrokScreen(screen([row])).userRows.map((r) => r.text)).toEqual([
        'Reply with the word kiwi.',
      ]);
    }
  });

  it.each(['grok-20-welcome', 'grok-28-welcome-62', 'grok-29-welcome-40'])(
    'reads the welcome screen %s by whether the conversation has history',
    (stem) => {
      const welcome = capture(stem);
      expect(grokSessionVerdict(welcome, input())).toEqual(other(GROK_WELCOME_REASON));
      expect(grokSessionVerdict(welcome, input({ transcript: transcript([], true) }))).toEqual(
        other(GROK_WELCOME_REASON),
      );
      expect(grokSessionVerdict(welcome, input({ transcript: transcript([]) }))).toEqual(UNKNOWN);
    },
  );

  const s1 = transcript([
    '# Reply with the word cherry',
    'Reply with the word fig',
    'Reply with the word mango',
  ]);
  const agentView = (rows: string[], status?: { label: string }) =>
    grokScreen({
      columns: 62,
      scrollback: rows,
      status,
      hints: [
        'Ctrl+\\:dashboard',
        'Ctrl+[/]:prev/next agent',
        'Ctrl+x:stop',
        'Shift+Tab:mode',
        'Ctrl+.:shortcuts',
      ],
      header: 'Se… │ main /p/t/hcl/pr… 21K / 256K │ ‹ 2/3 › │ [Dashboard]',
    });

  it("passes the dashboard's view of this conversation and holds another agent's", () => {
    const view = capture('grok-41-agent-view-this-62');
    expect(readGrokScreen(view).isDashboardOverlay).toBe(true);
    expect(grokSessionVerdict(view, input({ transcript: s1 }))).toEqual(THIS);
    const holds = other(GROK_AGENT_VIEW_REASON);
    expect(
      grokSessionVerdict(capture('grok-40-agent-view-other-62'), input({ transcript: s1 })),
    ).toEqual(holds);
    expect(
      grokSessionVerdict(
        capture('grok-42-agent-view-dispatched-62'),
        input({ transcript: transcript(['Reply with the word quince']) }),
      ),
    ).toEqual(holds);
  });

  it("holds the dashboard's view unless its newest message is this conversation's", () => {
    const mango = '❯ Reply with the word mango';
    expect(grokSessionVerdict(agentView([mango]), input({ transcript: s1 }))).toEqual(THIS);
    const holds = other(GROK_AGENT_VIEW_REASON);
    const unproven: [ReturnType<typeof agentView>, SessionCheckInput][] = [
      [agentView(['mango', '', 'Worked for 11s']), input({ transcript: s1 })],
      [agentView([mango, '', 'mango', '', '❯ /compact']), input({ transcript: s1 })],
      [agentView(['❯ Reply with the word fig', '', 'fig']), input({ transcript: s1 })],
      [agentView([mango], { label: 'Thinking…' }), input({ transcript: s1 })],
      [agentView([mango]), input({ transcript: s1, activity: 'working' })],
      [agentView([mango]), input({ transcript: s1, polledSinceIdle: false })],
      [agentView([mango]), input({ transcript: s1, unrecorded: ['Reply with the word mango '] })],
    ];
    for (const [view, checked] of unproven)
      expect(grokSessionVerdict(view, checked)).toEqual(holds);
  });

  it("without a followed session only the dashboard's view holds", () => {
    expect(grokSessionVerdict(capture('grok-41-agent-view-this-62'), null)).toEqual(
      other(GROK_AGENT_VIEW_REASON),
    );
    expect(grokSessionVerdict(screen(['❯ Reply with the word mango']), null)).toEqual(UNKNOWN);
  });
});
