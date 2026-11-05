import { describe, expect, it } from 'vitest';
import { encodeUtf8 } from '../../events/utf8';
import { FakeHostFiles } from '../model/fake-host-files';
import {
  completeLines,
  type SendWitness,
  witnessAppended,
  witnessMark,
  witnessVerdict,
} from './send-witness';

const LOG = '/work/prompts.jsonl';
const witness: SendWitness = {
  logPath: () => LOG,
  entry: (line) => {
    const [session, prompt] = new TextDecoder().decode(line).split('|');
    return session && prompt ? { sessionID: session, prompt } : null;
  },
  readLimit: 32,
};
const text = (lines: Uint8Array[]) => lines.map((line) => new TextDecoder().decode(line));

describe('Send witness', () => {
  it('marks a log the program has not written yet at size 0', async () => {
    const files = new FakeHostFiles();
    expect(await witnessMark(witness, '/work/t.jsonl', files)).toEqual({ path: LOG, size: 0 });
    files.write(LOG, 'a|b\n');
    expect(await witnessMark(witness, '/work/t.jsonl', files)).toEqual({ path: LOG, size: 4 });
  });

  it('keeps only the complete lines of a read that starts before the mark', () => {
    expect(text(completeLines(encodeUtf8('x\nab\ncd\nef'), true))).toEqual(['ab', 'cd']);
    // The mark split a line written before it: that line is dropped.
    expect(text(completeLines(encodeUtf8('xyz\nab\n'), true))).toEqual(['ab']);
    expect(completeLines(encodeUtf8('partial'), false)).toEqual([]);
    expect(text(completeLines(encodeUtf8('one\ntwo\n'), false))).toEqual(['one', 'two']);
    expect(completeLines(encodeUtf8('no newline here'), true)).toEqual([]);
  });

  it('reads what a log gained since the mark, and says when it is all of it', async () => {
    const files = new FakeHostFiles();
    files.write(LOG, 's1|old\n');
    const mark = await witnessMark(witness, '/t', files);
    files.append(LOG, 's1|new\ns2|other\n');
    const appended = await witnessAppended(witness, mark as never, files);
    expect(text(appended?.lines ?? [])).toEqual(['s1|new', 's2|other']);
    expect(appended?.isWholeAppend).toBe(true);
    // A line still being written is left out.
    files.append(LOG, 's3|part');
    expect(text((await witnessAppended(witness, mark as never, files))?.lines ?? [])).toEqual([
      's1|new',
      's2|other',
    ]);
  });

  it('is not the whole append past the read limit, and is null for a log that shrank', async () => {
    const files = new FakeHostFiles();
    files.write(LOG, 'a|1\n');
    const mark = await witnessMark(witness, '/t', files);
    files.append(LOG, `${'s|0123456789\n'.repeat(5)}`);
    expect((await witnessAppended(witness, mark as never, files))?.isWholeAppend).toBe(false);
    files.write(LOG, '');
    expect(await witnessAppended(witness, mark as never, files)).toBeNull();
    files.remove(LOG);
    expect(await witnessAppended(witness, mark as never, files)).toBeNull();
  });

  describe('verdict', () => {
    const echoKey = (value: string) => value.trim();
    const verdict = (lines: string[], isWholeAppend = true) =>
      witnessVerdict(witness, {
        lines: lines.map((line) => encodeUtf8(line)),
        key: 'hello',
        sessionID: 'Session-1',
        isWholeAppend,
        echoKey,
      });

    it('settles here when one line names the followed session', () => {
      expect(verdict(['session-1|hello'])).toBe('here');
      expect(verdict(['other|hello', 'SESSION-1|hello'], false)).toBe('here');
    });

    it('says elsewhere only for a whole append with exactly one line for the text', () => {
      expect(verdict(['other|hello'])).toBe('elsewhere');
      expect(verdict(['other|hello'], false)).toBe('unknown');
      expect(verdict(['other|hello', 'third|hello'])).toBe('unknown');
      expect(verdict(['other|something else'])).toBe('unknown');
    });
  });
});
