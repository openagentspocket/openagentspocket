import '../programs';
import { describe, expect, it } from 'vitest';
import { decodeAnsiScreen } from '../../blocked/ansi-decoder';
import { divider } from '../model/factories';
import type { ChatEntry } from '../model/types';
import type { ProgramSendPolicy } from './policy';
import { harness } from './tracker.testkit';

const delivered = (id: string, text: string) => ({ id, text, isDelivered: true });
const unsent = (id: string, text: string) => ({ id, text, isDelivered: false });

/** A message sent now, delivered a moment later, as the Composer does. */
function send(h: ReturnType<typeof harness>, id: string, text: string): void {
  h.tracker.updateSends([unsent(id, text)]);
  h.tracker.updateSends([delivered(id, text)]);
}

describe('SendTracker matching', () => {
  it('waits for a send, then records it once the transcript has it', () => {
    const h = harness();
    h.tracker.updateSends([unsent('a', 'fix it')]);
    expect(h.status('a')).toBe('awaiting');
    h.tracker.updateSends([delivered('a', 'fix it')]);
    expect(h.status('a')).toBe('awaiting');
    expect(h.calls.sent).toBe(1);
    h.record('fix it', 5);
    expect(h.status('a')).toBe('recorded');
  });

  it('counts only a prompt recorded after the send', () => {
    const h = harness();
    h.state.prompts.push({ offset: 3, text: 'fix it', entryID: null, pastedImagePaths: null });
    h.state.readOffset = 10;
    send(h, 'a', 'fix it');
    h.tick(1);
    h.tracker.match();
    expect(h.status('a')).toBe('awaiting');
    h.record('fix it', 12);
    expect(h.status('a')).toBe('recorded');
  });

  it('needs two recorded copies for two identical sends', () => {
    const h = harness();
    h.tracker.updateSends([unsent('a', 'again'), unsent('b', 'again')]);
    h.tracker.updateSends([delivered('a', 'again'), delivered('b', 'again')]);
    h.record('again', 5);
    expect(h.status('a')).toBe('recorded');
    expect(h.status('b')).toBe('awaiting');
    h.record('again', 9);
    expect(h.status('b')).toBe('recorded');
  });

  it('goes overdue once the echo timeout passes, and asks the owner to look again', () => {
    const h = harness();
    send(h, 'a', 'lost');
    h.tick(9);
    h.tracker.match();
    expect(h.status('a')).toBe('awaiting');
    h.tick(2);
    h.tracker.match();
    expect(h.status('a')).toBe('overdue');
    expect(h.calls.overdue).toBe(1);
  });

  it('gives a message first seen already delivered no echo', () => {
    const h = harness();
    h.tracker.updateSends([delivered('old', 'sent before Chat was watching')]);
    expect(h.status('old')).toBe('abandoned');
  });

  it('abandons an unrecorded send from an earlier conversation, and lets a later one match anywhere', () => {
    const h = harness();
    send(h, 'a', 'lost');
    h.state.generation = 2;
    h.state.layout = 1;
    h.tick(30);
    h.tracker.match();
    expect(h.status('a')).toBe('abandoned');
    const second = harness();
    send(second, 'b', 'first prompt');
    second.state.generation = 2;
    second.state.prompts.push({
      offset: 0,
      text: 'first prompt',
      entryID: null,
      pastedImagePaths: null,
    });
    second.tracker.match();
    expect(second.status('b')).toBe('recorded');
  });

  it('matches a pasted image path to the placeholder that names it', () => {
    const h = harness();
    send(h, 'a', '/tmp/shot.png');
    h.state.prompts.push({
      offset: 4,
      text: '[Image #1]',
      entryID: null,
      pastedImagePaths: ['/tmp/shot.png'],
    });
    h.tracker.match();
    expect(h.status('a')).toBe('recorded');
  });

  it('matches /compact to the compaction a program records instead of a prompt', () => {
    const h = harness();
    send(h, 'a', '/compact');
    const compaction: ChatEntry = {
      id: 'c1',
      sourceOffset: 8,
      content: { type: 'divider', value: divider('compaction') },
    };
    h.state.entries.push(compaction);
    h.state.readOffset = 20;
    h.tracker.match();
    expect(h.status('a')).toBe('recorded');
  });

  describe('a program whose entries outlive a rewrite of its file', () => {
    it('keeps a claim across a layout change', () => {
      const h = harness({ echoesByEntry: true });
      send(h, 'a', 'hello');
      h.state.prompts.push({ offset: 2, text: 'hello', entryID: 'e1', pastedImagePaths: null });
      h.tracker.match();
      expect(h.status('a')).toBe('recorded');
      // The file is rewritten: the same entry moves to another offset and must not match again.
      h.tracker.updateSends([delivered('a', 'hello'), unsent('b', 'hello')]);
      h.tracker.updateSends([delivered('a', 'hello'), delivered('b', 'hello')]);
      h.state.layout = 1;
      h.state.prompts = [{ offset: 50, text: 'hello', entryID: 'e1', pastedImagePaths: null }];
      h.tracker.match();
      expect(h.status('a')).toBe('recorded');
      expect(h.status('b')).toBe('awaiting');
    });
  });

  describe('a program that writes a new conversation with the first reply', () => {
    it('does not time a message out while the conversation is unwritten', () => {
      const h = harness({ writesNewConversationWithFirstReply: true });
      h.state.phase = {
        type: 'unavailable',
        reason: { kind: 'awaitingFirstMessage', program: 'pi' },
      };
      send(h, 'a', 'hello');
      h.tick(60);
      h.tracker.match();
      expect(h.status('a')).toBe('awaiting');
    });
  });
});

describe('SendTracker echo clock', () => {
  it('stops while the Agent works when the program says so', () => {
    const h = harness({ echoClockStopsWhileWorking: true });
    send(h, 'a', 'queued');
    h.setActivity('working');
    h.tick(30);
    h.tracker.match();
    expect(h.status('a')).toBe('awaiting');
    h.setActivity('idle');
    h.tick(11);
    h.tracker.match();
    expect(h.status('a')).toBe('overdue');
  });

  it('keeps running through a busy spell for other programs', () => {
    const h = harness();
    send(h, 'a', 'queued');
    h.setActivity('working');
    h.tick(30);
    h.tracker.match();
    expect(h.status('a')).toBe('overdue');
  });
});

describe('SendTracker returned sends (a program whose Stop hands steers back)', () => {
  const policy: Partial<ProgramSendPolicy> = {
    stopReturnsUntakenSends: true,
    readInputBox: (screen) => {
      const text = screen.rows
        .map((row) => row.text.trim())
        .filter(Boolean)
        .join('\n');
      return text === '' ? { kind: 'empty', placeholder: null } : { kind: 'text', text };
    },
  };

  it('reads a steer Stop put back in the box as returned, and a box that no longer holds it as discarded', async () => {
    const h = harness(policy);
    h.setActivity('working');
    h.tick(1);
    send(h, 'a', 'steer me');
    h.tick(1);
    h.setActivity('idle');
    h.tick(2);
    h.state.screen = decodeAnsiScreen('steer me');
    await h.tracker.checkReturnedSends();
    expect(h.status('a')).toBe('returned');
    h.state.screen = decodeAnsiScreen('');
    h.tracker.inputBoxWasRead(h.state.screen);
    expect(h.status('a')).toBe('discarded');
  });

  it('stays returned when the user added to it in the box, and is recorded by the longer prompt', async () => {
    const h = harness(policy);
    h.setActivity('working');
    h.tick(1);
    send(h, 'a', 'steer');
    h.setActivity('idle');
    h.tick(2);
    h.state.screen = decodeAnsiScreen('steer');
    await h.tracker.checkReturnedSends();
    expect(h.status('a')).toBe('returned');
    // The user added to it in the box: it stays returned, and the longer prompt settles it.
    h.tracker.inputBoxWasRead(decodeAnsiScreen('steer\nplus more'));
    expect(h.status('a')).toBe('returned');
    h.record('steer plus more', 9);
    expect(h.status('a')).toBe('recorded');
  });

  it('never reads the screen for a program that does not hand steers back', async () => {
    const h = harness();
    h.setActivity('working');
    send(h, 'a', 'steer');
    h.setActivity('idle');
    h.tick(2);
    h.state.screen = decodeAnsiScreen('steer');
    await h.tracker.checkReturnedSends();
    expect(h.state.screenReads).toBe(0);
  });
});

describe('SendTracker refused compactions (a program that declines one only on screen)', () => {
  const compaction: Partial<ProgramSendPolicy> = {
    compaction: {
      runningRow: (text) => text.includes('Compacting context...'),
      latestFailure: (screen) =>
        [...screen.rows].reverse().find((row) => row.text.includes('Compaction failed:')) ?? null,
      refusalText: () => 'Claude Code had nothing to compact.',
    },
  };

  it('refuses an overdue /compact the screen says failed, after one read', async () => {
    const h = harness(compaction);
    send(h, 'a', '/compact');
    h.tick(11);
    h.tracker.match();
    expect(h.status('a')).toBe('awaiting');
    h.state.screen = decodeAnsiScreen('Error: Compaction failed: Nothing to compact');
    await h.tracker.checkRefusedCompactions();
    expect(h.status('a')).toEqual('refused');
    await h.tracker.checkRefusedCompactions();
    expect(h.state.screenReads).toBe(1);
  });

  it('keeps the echo awaiting while the compaction still runs', async () => {
    const h = harness(compaction);
    send(h, 'a', '/compact');
    h.tick(11);
    h.state.screen = decodeAnsiScreen('Compacting context...');
    await h.tracker.checkRefusedCompactions();
    expect(h.status('a')).toBe('awaiting');
    h.tick(5);
    h.tracker.match();
    expect(h.status('a')).toBe('awaiting');
    h.tick(6);
    h.tracker.match();
    expect(h.status('a')).toBe('overdue');
  });

  it('abandons a /compact a later prompt overtook when the program records the compaction first', () => {
    const h = harness({ recordsCompactionBeforeNextPrompt: true });
    send(h, 'a', '/compact');
    h.tick(11);
    h.record('another message', 6);
    expect(h.status('a')).toBe('abandoned');
  });
});

describe('SendTracker send witness', () => {
  const LOG = '/work/session.jsonl.prompts';
  const witness: Partial<ProgramSendPolicy> = {
    sendWitness: {
      logPath: () => LOG,
      entry: (line) => {
        const parsed = JSON.parse(new TextDecoder().decode(line)) as { p: string; s: string };
        return { prompt: parsed.p, sessionID: parsed.s };
      },
    },
  };
  const line = (p: string, s: string) => `${JSON.stringify({ p, s })}\n`;

  it('marks the log when a send first shows and holds later sends when the log names another session', async () => {
    const h = harness(witness);
    h.files.write(LOG, line('earlier', 'session-1'));
    h.tracker.updateSends([unsent('a', 'hello there')]);
    await h.tracker.witnessMarksSettled();
    // The check before the send keeps the mark.
    expect(h.tracker.sendConcern('hello there', decodeAnsiScreen(''))).toBeNull();
    h.tracker.updateSends([delivered('a', 'hello there')]);
    h.files.append(LOG, line('hello there', 'other-session'));
    h.tick(3);
    h.tracker.match();
    await h.tracker.checkSendWitnesses();
    expect(h.status('a')).toBe('misdirected');
    expect(h.tracker.sessionConcern).toContain('another Claude Code session');
    expect(h.tracker.sendConcern('next', decodeAnsiScreen(''))).toContain(
      'another Claude Code session',
    );
    // A recorded copy clears the concern and the echo.
    h.record('hello there', 11);
    expect(h.status('a')).toBe('recorded');
    expect(h.tracker.sessionConcern).toBeNull();
  });

  it('settles a send the log names for this session without a concern', async () => {
    const h = harness(witness);
    h.tracker.updateSends([unsent('a', 'hello there')]);
    await h.tracker.witnessMarksSettled();
    h.tracker.sendConcern('hello there', decodeAnsiScreen(''));
    h.tracker.updateSends([delivered('a', 'hello there')]);
    h.files.append(LOG, line('hello there', 'session-1'));
    h.tick(3);
    h.tracker.match();
    await h.tracker.checkSendWitnesses();
    expect(h.status('a')).toBe('awaiting');
    expect(h.tracker.sessionConcern).toBeNull();
  });

  it('drops a mark the check before the send did not keep', async () => {
    const h = harness(witness);
    h.tracker.updateSends([unsent('a', 'hello')]);
    await h.tracker.witnessMarksSettled();
    h.tracker.updateSends([delivered('a', 'hello')]);
    h.files.append(LOG, line('hello', 'other-session'));
    h.tick(11);
    h.tracker.match();
    await h.tracker.checkSendWitnesses();
    expect(h.tracker.sessionConcern).toBeNull();
  });

  it('takes no mark for a program without a witness', async () => {
    const h = harness();
    h.tracker.updateSends([unsent('a', 'hello')]);
    await h.tracker.witnessMarksSettled();
    expect(h.files.readCount).toBe(0);
  });
});

describe('SendTracker session check', () => {
  it('holds a send while the screen shows another session, and lets it go once it shows this one', () => {
    let verdict: 'thisSession' | 'otherSession' | 'unknown' = 'otherSession';
    const h = harness({
      sessionCheck: () =>
        verdict === 'otherSession'
          ? { kind: 'otherSession', reason: 'The screen shows another session.' }
          : { kind: verdict },
    });
    const screen = decodeAnsiScreen('');
    expect(h.tracker.sendConcern('hello', screen)).toBe('The screen shows another session.');
    expect(h.calls.refresh).toBe(1);
    verdict = 'thisSession';
    expect(h.tracker.sendConcern('hello', screen)).toBeNull();
  });
});
