import { describe, expect, it } from 'vitest';
import { toolActivity } from '../model/factories';
import { shortCommand, toolLine } from './tool-line';

describe('the short form of a command', () => {
  it('skips assignments and cds, and marks what it leaves out', () => {
    expect(shortCommand('S=/private/tmp/x; cd "$S" && pnpm test --filter core -- --run')).toBe(
      'pnpm test --filter core …',
    );
    expect(shortCommand('git status && git diff --stat')).toBe('git status …');
    expect(shortCommand('FOO=1 make install')).toBe('make install');
  });

  it('cuts a long path to its last part', () => {
    expect(shortCommand('node /private/tmp/claude-501/agent/scratchpad/probe.mjs --once')).toBe(
      'node probe.mjs --once',
    );
    expect(shortCommand('ls --dir=/Users/someone/Projects/very/deep/folder')).toBe(
      'ls --dir=folder',
    );
  });

  it('keeps a short command whole', () => {
    expect(shortCommand('ls -la')).toBe('ls -la');
  });

  it('caps a single very long word', () => {
    const word = 'x'.repeat(80);
    expect(Array.from(shortCommand(word))).toHaveLength(49);
  });
});

describe('a tool row line', () => {
  const command = (title: string, extra: Partial<Parameters<typeof toolActivity>[0]> = {}) =>
    toolActivity({ kind: 'command', name: 'Bash', title, status: 'succeeded', ...extra });

  it('opens to the whole command only when the title cut it', () => {
    expect(toolLine(command('ls -la'))).toEqual({
      title: 'ls -la',
      isCommand: true,
      command: null,
    });
    expect(toolLine(command('cd src && ls -la'))).toMatchObject({
      title: 'ls -la',
      command: 'cd src && ls -la',
    });
  });

  it('keeps what other calls show', () => {
    const read = toolActivity({
      kind: 'search',
      name: 'Grep',
      title: 'TODO',
      subtitle: 'src',
      status: 'succeeded',
    });
    expect(toolLine(read)).toEqual({ title: 'src', isCommand: false, command: null });
  });
});
