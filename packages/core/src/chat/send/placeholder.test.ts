import '../programs';
import { describe, expect, it } from 'vitest';
import { CHAT_PROGRAMS } from '../model/types';
import { composerPlaceholder } from './placeholder';
import { sendPolicyFor } from './registry';

const key = (program: (typeof CHAT_PROGRAMS)[number], activity: 'working' | 'blocked' | 'idle') =>
  composerPlaceholder(sendPolicyFor(program), activity).key;

describe("the Composer's placeholder", () => {
  it('says a message waits for the turn where the program holds it until the turn ends', () => {
    expect(key('grok', 'working')).toBe('Queue for after this turn');
    expect(key('opencode', 'working')).toBe('Queue for after this turn');
  });

  it('says the Agent takes it at its next step where the program steers the running turn', () => {
    expect(key('claude', 'working')).toBe("Queue for the Agent's next step");
    expect(key('pi', 'working')).toBe("Queue for the Agent's next step");
  });

  it('keeps the plain words where a send interrupts or is unverified, and whenever not working', () => {
    expect(key('hermes', 'working')).toBe('Message Agent');
    expect(key('codex', 'working')).toBe('Message Agent');
    for (const program of CHAT_PROGRAMS) {
      expect(key(program, 'idle')).toBe('Message Agent');
      // Blocked keeps it: the send's own refusal says why nothing goes.
      expect(key(program, 'blocked')).toBe('Message Agent');
    }
    expect(composerPlaceholder(null, 'working').key).toBe('Message Agent');
  });
});
