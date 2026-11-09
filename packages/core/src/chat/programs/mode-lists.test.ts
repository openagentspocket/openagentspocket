import { describe, expect, it } from 'vitest';
import type { Message } from '../../errors/text';
import { programModes } from './index';
import { readProgramMode } from './modes';

const read = (program: string, ...rows: string[]): string | null => {
  const modes = programModes(program);
  if (!modes) throw new Error(`${program} lists no modes`);
  return (readProgramMode(modes, rows.join('\n')) as Message | null)?.key ?? null;
};

// Footers as each program draws them (live captures for Claude Code, Codex and OpenCode).
describe('every program names its mode from its own footer', () => {
  it('Claude Code', () => {
    expect(read('claude', '❯', '  ⏸ manual mode on')).toBe('Manual Mode');
    expect(read('claude', '❯', '  ⏵⏵ accept edits on (shift+tab to cycle)')).toBe('Accept Edits');
    expect(read('claude', '❯', '  ⏸ plan mode on (shift+tab to cycle)')).toBe('Plan Mode');
    expect(read('claude', '❯', '  ⏵⏵ auto mode on (shift+tab to cycle) · ← 1 agent')).toBe(
      'Auto Mode',
    );
    expect(read('claude', '❯', '  ? for shortcuts')).toBe('Default Mode');
  });

  it('Codex, ignoring its own "for Plan mode" line in the conversation', () => {
    expect(read('codex', '›', 'gpt-6-luna medium · /path… Plan mode')).toBe('Plan Mode');
    expect(read('codex', '• Model changed to gpt high for Plan mode.', '›', 'gpt medium')).toBe(
      'Default Mode',
    );
  });

  it('OpenCode', () => {
    expect(read('opencode', '┃  Build auto · LFM2.5 local')).toBe('Build, Auto-Accept');
    expect(read('opencode', '┃  Plan · gpt-6 openai')).toBe('Plan');
  });

  it('Hermes draws only its YOLO badge', () => {
    expect(read('hermes', '❯', 'model · ⚠ YOLO')).toBe('YOLO');
    expect(read('hermes', '❯', 'model')).toBeNull();
  });

  it('Pi and Oh My Pi name the thinking level', () => {
    expect(read('pi', '(anthropic) claude-x • high')).toBe('Thinking High');
    expect(read('pi', 'claude-x • xhigh')).toBe('Thinking Extra High');
    expect(read('pi', 'claude-x • thinking off')).toBe('Thinking Off');
    expect(read('omp', 'claude-x ◑ med')).toBe('Thinking Medium');
    expect(read('omp', '🗺 Plan  claude-x ◔ low')).toBe('Plan Mode');
  });

  it('Grok Build, whose Normal mode draws no flag', () => {
    expect(read('grok', 'grok-5 · plan · always-approve')).toBe('Plan Mode');
    expect(read('grok', 'grok-5 · always-approve')).toBe('Always Approve');
    expect(read('grok', 'grok-5')).toBe('Normal Mode');
  });
});
