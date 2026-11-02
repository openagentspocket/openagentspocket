import { describe, expect, it } from 'vitest';
import { PROGRAM_BRANDS, PROGRAM_KINDS, programIdentity } from './programs';

/** Kinds with no mark in Lobe Icons: they must show the monogram, never a look-alike. */
const WITHOUT_LOGO = ['omp', 'droid', 'maki', 'muse', 'letta'];

describe('programIdentity', () => {
  it('keeps every kind its product name and resolves its own spelling', () => {
    for (const info of PROGRAM_KINDS) {
      const identity = programIdentity(info.kind);
      expect(identity.kind).toBe(info.kind);
      expect(identity.displayName).toBe(info.displayName);
      expect(programIdentity(info.displayName).kind).toBe(info.kind);
    }
  });

  it('gives a logo to exactly the kinds that have one, each brand to one kind', () => {
    const logoless = PROGRAM_KINDS.filter((info) => !info.brand).map((info) => info.kind);
    expect(logoless.sort()).toEqual([...WITHOUT_LOGO].sort());
    const brands = PROGRAM_KINDS.flatMap((info) => (info.brand ? [info.brand] : []));
    expect(new Set(brands).size).toBe(brands.length);
    expect([...brands].sort()).toEqual([...PROGRAM_BRANDS].sort());
  });

  it.each([
    'claude',
    'Claude',
    ' claude ',
    'claude-code',
    'claude_code',
    'claudecode',
    'Claude Code',
  ])('resolves the Claude spelling %j', (spelling) => {
    const identity = programIdentity(spelling);
    expect(identity.kind).toBe('claude');
    expect(identity.displayName).toBe('Claude Code');
    expect(identity.brand).toBe('claude');
  });

  it('resolves executables and aliases', () => {
    expect(programIdentity('cursor-agent').kind).toBe('cursor');
    expect(programIdentity('kiro-cli').kind).toBe('kiro');
    expect(programIdentity('agy').kind).toBe('agy');
    expect(programIdentity('antigravity').kind).toBe('agy');
    expect(programIdentity('Gemini CLI').kind).toBe('gemini');
    expect(programIdentity('copilot-cli').kind).toBe('copilot');
    expect(programIdentity('letta-code').displayName).toBe('Letta Code');
    expect(programIdentity('codex').brand).toBe('openai');
  });

  it('keeps an unknown program its name and draws no logo', () => {
    const identity = programIdentity(' deepseek ');
    expect(identity).toEqual({ program: 'deepseek', displayName: 'deepseek' });
    expect(programIdentity('').displayName).toBe('Agent');
    expect(programIdentity('letta').brand).toBeUndefined();
  });
});
