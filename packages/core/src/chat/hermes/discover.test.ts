import { describe, expect, it } from 'vitest';
import { hermesDiscoverScript, parseDiscoveredSession } from './discover';

describe('finding a Hermes conversation herdr did not report', () => {
  it('takes the only open conversation', () => {
    expect(parseDiscoveredSession('local-abc\n')).toBe('local-abc');
  });

  it('names none when two are open, or none is', () => {
    expect(parseDiscoveredSession('local-a\nlocal-b\n')).toBeNull();
    expect(parseDiscoveredSession('')).toBeNull();
  });

  it('refuses output that is not an id', () => {
    expect(parseDiscoveredSession("x'; drop\n")).toBeNull();
  });

  it('never puts a directory that could break out of the query in the script', () => {
    expect(hermesDiscoverScript(["/tmp/a'; rm -rf /"])).toBeNull();
    expect(hermesDiscoverScript(['/tmp/$(id)'])).toBeNull();
    expect(hermesDiscoverScript(['relative/path'])).toBeNull();
    expect(hermesDiscoverScript(['/home/ada/work'])).toContain("'/home/ada/work'");
  });

  it('reads only stores Hermes has open, read-only', () => {
    const script = hermesDiscoverScript(['/w']) ?? '';
    expect(script).toContain('[ -e "$f-wal" ] && [ -e "$f-shm" ] || continue');
    expect(script).toContain('-readonly');
  });
});
