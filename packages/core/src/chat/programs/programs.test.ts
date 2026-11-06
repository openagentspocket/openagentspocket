import { describe, expect, it } from 'vitest';
import { bindTarget } from '../engine/store-bind';
import { CHAT_PROGRAMS } from '../model/types';
import { programDefinition, programDefinitions } from './index';

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

  it('only Pi has no Blocked dialogs to parse', () => {
    const without = programDefinitions().filter((definition) => !definition.blocked);
    expect(without.map((definition) => definition.program)).toEqual(['pi']);
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
