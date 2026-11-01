import { describe, expect, it } from 'vitest';
import {
  type EnrollmentRefusal,
  enrollmentRefusal,
  failureStep,
  isTailscaleSSH,
  type PairingCeremonyFailure,
  type PairingStep,
  parseEnrollmentResponse,
} from './ceremony';

describe('Enrollment accept protocol', () => {
  it('parses a success line with its fingerprint', () => {
    const fingerprint = 'SHA256:0Y1eCbGuGWCGKirP9nWzOTLIcuBLvewToJfOPQqrjHY';
    expect(parseEnrollmentResponse(`HERDR-ENROLL:OK:${fingerprint}`)).toEqual({
      kind: 'enrolled',
      fingerprint,
    });
  });

  it.each([
    ['HERDR-ENROLL:ERR:unknown_pairing', 'unknownPairing'],
    ['HERDR-ENROLL:ERR:expired', 'expired'],
    ['HERDR-ENROLL:ERR:invalid_key', 'invalidKey'],
    ['HERDR-ENROLL:ERR:no_input', 'noInput'],
  ] as const)('parses the documented refusal %s', (line, kind) => {
    expect(parseEnrollmentResponse(line)).toEqual({ kind: 'refused', refusal: { kind } });
  });

  it('keeps unrecognized refusal codes as refusals', () => {
    expect(parseEnrollmentResponse('HERDR-ENROLL:ERR:quota_exceeded')).toEqual({
      kind: 'refused',
      refusal: { kind: 'unrecognized', code: 'quota_exceeded' },
    });
  });

  it.each([
    '',
    'HERDR-ENROLL:OK:',
    'HERDR-ENROLL:ERR:',
    'HERDR-ENROLL:WAT:hm',
    'welcome to fish, the friendly interactive shell',
    'HERDR-PAIR:1:e30',
    'HERDR-ENROLL:OK:MD5:aa:bb',
    'HERDR-ENROLL:ERR:expired\n',
  ])('rejects a line outside the protocol: %j', (line) => {
    expect(parseEnrollmentResponse(line)).toBeNull();
  });

  it('round-trips the refusal wire codes', () => {
    const cases: [string, EnrollmentRefusal][] = [
      ['unknown_pairing', { kind: 'unknownPairing' }],
      ['expired', { kind: 'expired' }],
      ['invalid_key', { kind: 'invalidKey' }],
      ['no_input', { kind: 'noInput' }],
      ['later_code', { kind: 'unrecognized', code: 'later_code' }],
    ];
    for (const [wire, refusal] of cases) expect(enrollmentRefusal(wire)).toEqual(refusal);
  });
});

describe('Pairing failure taxonomy', () => {
  it('classifies every failure to its step', () => {
    const cases: [PairingCeremonyFailure, PairingStep][] = [
      [{ kind: 'hostUnreachable', detail: 'x' }, 'reach'],
      [{ kind: 'tailscaleSSH', addresses: ['100.64.0.1'], port: 22 }, 'reach'],
      [{ kind: 'bootstrapRejected' }, 'authenticate'],
      [{ kind: 'enrollmentRefused', refusal: { kind: 'expired' } }, 'enroll'],
      [{ kind: 'enrollmentUnanswered' }, 'enroll'],
      [{ kind: 'enrollmentFailed', detail: 'x' }, 'enroll'],
      [{ kind: 'verificationFailed', detail: 'x' }, 'verify'],
    ];
    for (const [failure, step] of cases) expect(failureStep(failure)).toBe(step);
  });

  it.each([
    ['SSH-2.0-Tailscale', true],
    ['SSH-2.0-Tailscale_1.102.4', true],
    ['SSH-2.0-Tailscale some comment', true],
    ['SSH-2.0-OpenSSH_9.9', false],
    ['SSH-2.0-OpenSSH_9.9 Tailscale', false],
    ['SSH-1.99-Tailscale', false],
    ['', false],
  ] as const)('recognizes Tailscale SSH by its banner: %j', (identification, expected) => {
    expect(isTailscaleSSH(identification)).toBe(expected);
  });

  it('does not take a missing banner for Tailscale SSH', () => {
    expect(isTailscaleSSH(null)).toBe(false);
  });
});
