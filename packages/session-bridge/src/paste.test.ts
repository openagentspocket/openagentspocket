import { describe, expect, it } from 'vitest';
import { loadArgs, normalizeText, pasteArgs, pasteOrType, typeArgs } from './paste.js';
import type { TmuxRunner } from './tmux.js';

function fake(failOn?: string) {
  const calls: { args: string[]; input?: string }[] = [];
  const tmux: TmuxRunner = {
    run: async (args, input) => {
      calls.push({ args: [...args], input });
      if (args[0] === failOn) throw new Error('tmux failed');
      return '';
    },
  };
  return { tmux, calls };
}

describe('normalizeText', () => {
  it('turns CRLF and CR into LF and drops trailing breaks', () => {
    expect(normalizeText('a\r\nb\rc\n\n')).toBe('a\nb\nc');
    expect(normalizeText('a\n\nb')).toBe('a\n\nb');
    expect(normalizeText('\n\n')).toBe('');
  });
});

describe('argument building', () => {
  it('pastes bracketed, raw, into one named buffer that is deleted', () => {
    expect(pasteArgs('%2', 'b1')).toEqual([
      'paste-buffer',
      '-p',
      '-r',
      '-d',
      '-b',
      'b1',
      '-t',
      '%2',
    ]);
    expect(loadArgs('b1')).toEqual(['load-buffer', '-b', 'b1', '-']);
    expect(typeArgs('%2', '-x')).toEqual(['send-keys', '-t', '%2', '-l', '--', '-x']);
  });
});

describe('pasteOrType', () => {
  it('types a single line, and a trailing break does not make it a paste', async () => {
    const { tmux, calls } = fake();
    await pasteOrType(tmux, '%1', 'hello\n');
    expect(calls.map((c) => c.args)).toEqual([typeArgs('%1', 'hello')]);
  });

  it('sends nothing for empty or break-only text', async () => {
    const { tmux, calls } = fake();
    await pasteOrType(tmux, '%1', '');
    await pasteOrType(tmux, '%1', '\r\n');
    expect(calls).toEqual([]);
  });

  it('loads multi-line text through stdin, never argv, then pastes that buffer once', async () => {
    const { tmux, calls } = fake();
    await pasteOrType(tmux, '%1', '-rf a\r\n\r\nb\n');
    expect(calls).toHaveLength(2);
    expect(calls[0]?.input).toBe('-rf a\n\nb');
    expect(calls[0]?.args.join(' ')).not.toContain('rf');
    const buffer = calls[0]?.args[2] as string;
    expect(buffer).toMatch(/^oap-/u);
    expect(calls[1]?.args).toEqual(pasteArgs('%1', buffer));
  });

  it('uses a fresh buffer name per paste', async () => {
    const { tmux, calls } = fake();
    await pasteOrType(tmux, '%1', 'a\nb');
    await pasteOrType(tmux, '%1', 'a\nb');
    expect(calls[0]?.args[2]).not.toBe(calls[2]?.args[2]);
  });

  it('deletes the buffer when the paste fails', async () => {
    const { tmux, calls } = fake('paste-buffer');
    await expect(pasteOrType(tmux, '%1', 'a\nb')).rejects.toThrow('tmux failed');
    expect(calls.at(-1)?.args.slice(0, 2)).toEqual(['delete-buffer', '-b']);
  });
});
