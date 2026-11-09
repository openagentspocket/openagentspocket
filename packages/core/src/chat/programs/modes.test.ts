import { describe, expect, it } from 'vitest';
import { modeLabel, readProgramMode } from './modes';

const modes = {
  labels: [modeLabel('plan mode on', 'Plan Mode'), modeLabel('auto mode on', 'Auto Mode')],
  otherwise: { key: 'Default Mode' },
};

describe('reading an Agent mode from its screen', () => {
  it('names the mode the footer draws', () => {
    const screen = 'answer\n\n❯\n────\n  ⏵⏵ auto mode on (shift+tab to cycle) · ← 1 agent\n';
    expect(readProgramMode(modes, screen)).toEqual({ key: 'Auto Mode' });
  });

  it('reads only the bottom rows, so the same words in the conversation do not count', () => {
    const conversation = ['we turned plan mode on yesterday', ...Array(20).fill('line')];
    expect(readProgramMode(modes, [...conversation, '❯', '? for shortcuts'].join('\n'))).toEqual({
      key: 'Default Mode',
    });
  });

  it('says nothing for a program whose default draws nothing it can name', () => {
    expect(readProgramMode({ labels: modes.labels, otherwise: null }, '❯')).toBeNull();
  });

  it('takes the lowest row that names a mode, and skips the conversation rows it is told to', () => {
    const codex = {
      labels: [modeLabel('Plan mode', 'Plan Mode')],
      otherwise: { key: 'Default Mode' },
      conversationRow: '•',
    };
    const screen = ['• Model changed to gpt high for Plan mode.', '›', 'gpt medium · ~/app'].join(
      '\n',
    );
    expect(readProgramMode(codex, screen)).toEqual({ key: 'Default Mode' });
    expect(readProgramMode(modes, 'plan mode on\n⏵⏵ auto mode on')).toEqual({ key: 'Auto Mode' });
  });
});
