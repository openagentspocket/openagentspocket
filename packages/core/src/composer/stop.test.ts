import { describe, expect, it } from 'vitest';
import { FakeClock } from '../hosts/cancellation';
import { containsOnlySafeScalars } from '../terminal/text-safety';
import { refusalEndsWhenStatusBecomes } from './policy';
import { ComposerStopStore, primaryControl } from './stop';
import { detectSkillTrigger, matchingSkills } from './suggestions';

const sent = async () => ({ kind: 'sent' as const });

describe('primaryControl', () => {
  it('is Stop only for a working agent with a blank draft', () => {
    expect(primaryControl({ status: 'working', draft: '  ', canStop: true })).toBe('stop');
    expect(primaryControl({ status: 'working', draft: 'text', canStop: true })).toBe('send');
    expect(
      primaryControl({ status: 'working', draft: '', canStop: true, hasAttachments: true }),
    ).toBe('send');
    for (const status of ['idle', 'done', 'blocked', 'unknown']) {
      expect(primaryControl({ status, draft: '', canStop: true })).toBe('send');
    }
    expect(primaryControl({ status: 'working', draft: '', canStop: false })).toBe('send');
  });
});

describe('ComposerStopStore', () => {
  it('presses once, then waits for the status instead of pressing again', async () => {
    const clock = new FakeClock();
    const stop = new ComposerStopStore(clock);
    let presses = 0;
    const press = async () => {
      presses += 1;
      return { kind: 'sent' as const };
    };
    stop.stop(press);
    await clock.advance(0);
    expect(stop.isStopping).toBe(true);
    expect(stop.stop(press)).toBeUndefined();
    expect(presses).toBe(1);
    stop.agentStatusChanged('idle');
    expect(stop.phase.kind).toBe('ready');
  });

  it('keeps waiting through Working pushes and says what it sees past the window', async () => {
    const clock = new FakeClock();
    const stop = new ComposerStopStore(clock);
    stop.stop(sent);
    await clock.advance(1000);
    stop.agentStatusChanged('working');
    expect(stop.isStopping).toBe(true);
    await clock.advance(2500);
    expect(stop.phase.kind).toBe('unconfirmed');
    expect(stop.notice).toBeTruthy();
    expect(stop.stop(sent)).toBeDefined();
  });

  it('a failed press says why and works again at once', async () => {
    const clock = new FakeClock();
    const stop = new ComposerStopStore(clock);
    stop.stop(async () => ({ kind: 'failed', message: 'no writer' }));
    await clock.advance(0);
    expect(stop.phase).toEqual({ kind: 'failed', message: 'no writer' });
    expect(stop.stop(sent)).toBeDefined();
  });

  it('a status change while the keys are on their way wins', async () => {
    const clock = new FakeClock();
    const stop = new ComposerStopStore(clock);
    let finish!: () => void;
    stop.stop(
      () =>
        new Promise((resolve) => {
          finish = () => resolve({ kind: 'sent' });
        }),
    );
    stop.agentStatusChanged('done');
    finish();
    await clock.advance(5000);
    expect(stop.phase.kind).toBe('ready');
  });

  it('a minimum gap ignores taps too soon after the last attempt', async () => {
    const clock = new FakeClock();
    const stop = new ComposerStopStore(clock);
    const wait = { windowMs: 100, unconfirmedNotice: 'still', minimumGapMs: 1000 };
    stop.stop(sent, wait);
    await clock.advance(0);
    stop.agentStatusChanged('idle');
    expect(stop.stop(sent, wait)).toBeUndefined();
    await clock.advance(1000);
    expect(stop.stop(sent, wait)).toBeDefined();
  });
});

describe('suggestions', () => {
  const skills = [
    { name: 'web', command: '/skill:web', commandPrefix: '/skill:', description: 'Browse pages' },
    { name: 'review', command: '/review', commandPrefix: '/', description: 'Review code' },
  ];

  it('detects the trailing token after whitespace and prefers the longest prefix', () => {
    expect(detectSkillTrigger('use /skill:we', ['/', '/skill:'])).toEqual({
      token: '/skill:we',
      prefix: '/skill:',
      query: 'we',
    });
    expect(detectSkillTrigger('path/to', ['/'])).toBeUndefined();
    expect(detectSkillTrigger('trailing ', ['/'])).toBeUndefined();
  });

  it('matches by command continuation, then by name or description on the same prefix', () => {
    const sk = detectSkillTrigger('/sk', ['/', '/skill:']);
    expect(sk && matchingSkills(sk, skills).map((s) => s.name)).toEqual(['web']);
    const query = detectSkillTrigger('/code', ['/']);
    expect(query && matchingSkills(query, skills).map((s) => s.name)).toEqual(['review']);
  });
});

describe('safety and refusals', () => {
  it('allows tab and newlines but no escapes or other controls', () => {
    expect(containsOnlySafeScalars('a\tb\r\nc é 😀')).toBe(true);
    expect(containsOnlySafeScalars('x\u001b[0m')).toBe(false);
    expect(containsOnlySafeScalars('x\u0003')).toBe(false);
    expect(containsOnlySafeScalars('x\u007f')).toBe(false);
  });

  it('ends a refusal with the state it named', () => {
    expect(refusalEndsWhenStatusBecomes({ kind: 'agentBlocked' }, 'working')).toBe(true);
    expect(refusalEndsWhenStatusBecomes({ kind: 'agentBlocked' }, 'blocked')).toBe(false);
    expect(refusalEndsWhenStatusBecomes({ kind: 'commandAwaitsIdle', name: 'x' }, 'done')).toBe(
      true,
    );
    expect(refusalEndsWhenStatusBecomes({ kind: 'unknownCommand', name: 'x' }, 'idle')).toBe(false);
  });
});
