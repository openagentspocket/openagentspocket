import { describe, expect, it } from 'vitest';
import { bindTarget } from '../engine/store-bind';
import { CHAT_PROGRAMS } from '../model/types';
import { COMMON_SHORTCUTS, programDefinition, programDefinitions, programShortcuts } from './index';

describe('program definitions', () => {
  it('defines every Chat program under its own name, with parts of that program', () => {
    expect(programDefinitions().map((definition) => definition.program)).toEqual([
      ...CHAT_PROGRAMS,
    ]);
    for (const program of CHAT_PROGRAMS) {
      const definition = programDefinition(program);
      expect(definition.adapter()?.program).toBe(program);
      expect(definition.sendPolicy().program).toBe(program);
      expect(definition.chatName).not.toBe('');
    }
  });

  it('only Pi and Hermes Agent have no Blocked dialogs to parse', () => {
    const without = programDefinitions().filter((definition) => !definition.blocked);
    expect(without.map((definition) => definition.program)).toEqual(['pi', 'hermes']);
  });
});

describe('a program Chat has no reader for', () => {
  it('binds to nothing and says so, instead of reading as Claude Code', () => {
    const view = {
      program: null,
      activity: 'idle',
      cwd: null,
      foregroundCwd: null,
      session: null,
    } as const;
    const binding = bindTarget(view, () => null, null, null);
    expect(binding.target).toBeNull();
    expect(binding.reason).toEqual({ kind: 'unreadableProgram' });
  });
});

describe('program shortcuts', () => {
  it('gives an Agent of a program Chat does not know the common keys', () => {
    expect(programShortcuts('some-new-agent')).toBe(COMMON_SHORTCUTS);
    expect(programShortcuts(null)).toBe(COMMON_SHORTCUTS);
  });

  it('gives every program a way to interrupt, and only herdr key names or slash commands', () => {
    for (const program of CHAT_PROGRAMS) {
      const shortcuts = programShortcuts(program);
      expect(
        shortcuts.some(
          (s) =>
            (s.kind === 'keys' && s.keys.join() === 'esc') ||
            (s.kind === 'keys' && s.keys.join() === 'ctrl+c'),
        ),
      ).toBe(true);
      for (const shortcut of shortcuts) {
        if (shortcut.kind === 'keys') {
          for (const key of shortcut.keys)
            expect(key).toMatch(/^(esc|enter|tab|shift\+tab|up|down|left|right|(ctrl|alt)\+.)$/);
        } else {
          expect(shortcut.command).toMatch(/^\/[a-z][a-z0-9-]*$/);
        }
      }
    }
  });

  it('interrupts with the key each program documents: Ctrl+C where Esc does nothing', () => {
    const interrupt = (program: string) => {
      const first = programShortcuts(program)[0];
      return first?.kind === 'keys' ? first.keys : null;
    };
    expect(interrupt('hermes')).toEqual(['ctrl+c']);
    expect(interrupt('grok')).toEqual(['ctrl+c']);
    for (const program of ['claude', 'codex', 'opencode', 'pi', 'omp']) {
      expect(interrupt(program)).toEqual(['esc']);
    }
  });
});
