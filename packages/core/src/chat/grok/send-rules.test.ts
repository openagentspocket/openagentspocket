import { describe, expect, it } from 'vitest';
import { encodeUtf8 } from '../../events/utf8';
import {
  GROK_BUILT_INS,
  grokSlashRefusal,
  promptHistoryEntry,
  promptHistoryPath,
} from './send-rules';

const SIDE_QUESTION = {
  kind: 'unsafeText',
  reason:
    'Grok Build would treat this as a /btw side question and keep it out of the conversation. Rephrase it, or ask in the terminal.',
};
const MID_TEXT_GOAL = {
  kind: 'unsafeText',
  reason:
    "Grok Build runs /goal only at the start of a message and wouldn't send this. Set goals in the terminal.",
};
const clean = (text: string) => text.replace(/^\s+|\s+$/g, '');

describe('Grok Build send rules', () => {
  it.each([
    ['what next /btw ok', SIDE_QUESTION],
    ['a\n/goal b', MID_TEXT_GOAL],
    ['fix it /GOAL', MID_TEXT_GOAL],
    ['ask\t/BTW why', SIDE_QUESTION],
  ])('refuses %j mid-text', (text, refusal) => {
    expect(grokSlashRefusal(text, clean(text))).toEqual(refusal);
  });

  it('leaves a leading command to the menu rule', () => {
    expect(grokSlashRefusal('/goal x', '/goal x')).toBeNull();
    expect(grokSlashRefusal('  /btw why', '/btw why')).toBeNull();
  });

  it.each(['/btw,', 'a/btw', '/btwx', '/goals'])('sends the lookalike %s', (token) => {
    const draft = `what next ${token} ok`;
    expect(grokSlashRefusal(draft, draft)).toBeNull();
  });

  it('refuses /compact with a focus and sends it alone', () => {
    expect(grokSlashRefusal('/compact keep the API notes', '/compact keep the API notes')).toEqual({
      kind: 'commandUnavailable',
      reason: "Grok Build's /compact takes no focus. Send /compact on its own.",
    });
    expect(grokSlashRefusal('  /compact \n', '/compact')).toBeNull();
  });

  it('reserves the built-in command names', () => {
    for (const name of ['quit', 'delete', 'new', 'undo', 'always-approve', 'plan', 'logout']) {
      expect(GROK_BUILT_INS.has(name)).toBe(true);
    }
    expect(GROK_BUILT_INS.has('review')).toBe(false);
  });
});

describe('Grok Build prompt history', () => {
  it('sits beside the session group', () => {
    expect(
      promptHistoryPath(
        '/home/dev/.grok/sessions/%2Fhome%2Fdev%2Fproj/01900000-0000-7000-8000-000000000004/updates.jsonl',
      ),
    ).toBe('/home/dev/.grok/sessions/%2Fhome%2Fdev%2Fproj/prompt_history.jsonl');
  });

  it('names the session that took a prompt and skips shell commands', () => {
    const line = (prompt: string, isBash = false) =>
      encodeUtf8(JSON.stringify({ timestamp: 't', session_id: 's1', prompt, is_bash: isBash }));
    expect(promptHistoryEntry(line('Reply with the word kiwi.'))).toEqual({
      prompt: 'Reply with the word kiwi.',
      sessionID: 's1',
    });
    expect(promptHistoryEntry(line('ls', true))).toBeNull();
    expect(promptHistoryEntry(encodeUtf8('not json'))).toBeNull();
  });
});
