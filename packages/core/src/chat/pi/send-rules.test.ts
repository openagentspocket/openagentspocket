// Pi and Oh My Pi send rules and policy: the Swift ChatSendRules tests for `.pi` and `.omp`.

import { describe, expect, it } from 'vitest';
import { sendPolicyFor } from '../send/registry';
import { rulesFor } from '../send/send.testkit';

const pi = sendPolicyFor('pi');
const omp = sendPolicyFor('omp');

describe('Pi and Oh My Pi send policy', () => {
  it('is registered by program with Pi and Oh My Pi names', () => {
    expect(pi.chatName).toBe('Pi');
    expect(omp.chatName).toBe('Oh My Pi');
    expect(pi.echoesByEntry && omp.echoesByEntry).toBe(true);
    expect(pi.stopReturnsUntakenSends).toBe(true);
    expect(pi.stop.keys).toEqual(['esc']);
  });
});

describe('send rules', () => {
  it.each(['exit', ' QUIT \n', 'q', 'Exit'])('Oh My Pi refuses the bare exit word %j', (draft) => {
    expect(rulesFor('omp').validate(draft)?.kind).toBe('unsafeText');
  });

  it.each(['$ ls', '$$ print(1)', '$\tx', '  $ import os\nos.listdir()'])(
    'Oh My Pi refuses the Python prefix %j',
    (draft) => {
      expect(rulesFor('omp').validate(draft)?.kind).toBe('unsafeText');
    },
  );

  it.each(['.', ' c ', 'C', '-> x', '=> after this', '->'])(
    'Oh My Pi refuses the Continue and queue shorthand %j',
    (draft) => {
      expect(rulesFor('omp').validate(draft)?.kind).toBe('unsafeText');
    },
  );

  it.each([
    'quit smoking',
    'q?',
    '$HOME is set',
    '$5 total',
    "c'est",
    '..',
    'a -> b',
    'exit the loop',
  ])('Oh My Pi takes the lookalike %j as text', (draft) => {
    expect(rulesFor('omp').read(draft)).toEqual({ kind: 'text' });
  });

  it('Oh My Pi refuses hundred-line pastes, with LF or CRLF breaks', () => {
    const rules = rulesFor('omp');
    const lines = (count: number) =>
      Array.from({ length: count }, (_, i) => `line ${i + 1}`).join('\n');
    expect(rules.validate(lines(99))).toBeUndefined();
    expect(rules.validate(`${lines(99)}\n\n  \n`)).toBeUndefined();
    expect(rules.validate(lines(100))?.kind).toBe('unsafeText');
    expect(rules.validate(lines(100).replaceAll('\n', '\r\n'))?.kind).toBe('unsafeText');
  });

  it.each([
    'exit',
    'q',
    '$ ls',
    '$$ print(1)',
    '.',
    'c',
    '-> x',
    '=> x',
    Array.from({ length: 150 }, (_, i) => `line ${i + 1}`).join('\n'),
  ])('Pi accepts what Oh My Pi refuses: %j', (draft) => {
    expect(rulesFor('pi').validate(draft)).toBeUndefined();
  });

  it('keeps the refusal wording', () => {
    const rules = rulesFor('omp');
    expect(rules.validate(' QUIT \n')).toEqual({
      kind: 'unsafeText',
      reason: 'Sending this would exit Oh My Pi. Open the terminal to exit.',
    });
    expect(rules.validate('$ ls')).toEqual({
      kind: 'unsafeText',
      reason: 'A message starting with $ runs Python in Oh My Pi. Open the terminal to run it.',
    });
    expect(rules.validate('c')).toEqual({
      kind: 'unsafeText',
      reason: 'Oh My Pi reads this as Continue. Open the terminal to continue.',
    });
    expect(rules.validate('/compact keep the API notes')).toEqual({
      kind: 'commandUnavailable',
      reason: 'Add compaction focus in the Agent terminal.',
    });
    expect(rulesFor('pi').validate('a\u001b[201~b')).toEqual({
      kind: 'unsafeText',
      reason: 'The message contains terminal control characters.',
    });
  });

  it('Oh My Pi sends /compact without a trailing space; Pi takes it like any message', () => {
    const rules = rulesFor('omp');
    expect(rules.validate('/compact')).toBeUndefined();
    expect(rules.outgoingText('/compact')).toBe('/compact');
    expect(rules.outgoingText('  /compact \n')).toBe('/compact');
    const piRules = rulesFor('pi');
    expect(piRules.outgoingText('/compact')).toBe('/compact ');
    expect(piRules.validate('/compact keep the API notes')).toBeUndefined();
    expect(piRules.outgoingText('/compact keep the API notes')).toBe(
      '/compact keep the API notes ',
    );
  });

  it.each(['pi', 'omp'] as const)(
    '%s offers only /skill: skills and sends them in that form',
    (program) => {
      const rules = rulesFor(program, { prefix: '/skill:' });
      expect(rules.commands.map((command) => command.name)).toEqual([
        'compact',
        'review',
        'deploy',
      ]);
      expect(rules.outgoingText('/review the diff')).toBe('/skill:review the diff ');
      // A prompt template is a plain `/name`: not offered.
      expect(rulesFor(program, { prefix: '/' }).commands.map((command) => command.name)).toEqual([
        'compact',
      ]);
    },
  );
});
