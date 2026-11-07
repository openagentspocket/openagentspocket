import type { AgentSkill } from '@openagentspocket/core';
import { ThemeProvider } from '@openagentspocket/ui';
import { render, screen } from '@testing-library/react-native';
import { SkillContentSheet } from './SkillContentSheet';

const skill = { name: 'review', path: '/skills/review/SKILL.md' } as unknown as AgentSkill;

const show = (readFile: (path: string) => Promise<string>) =>
  render(
    <ThemeProvider themeId="indigo">
      <SkillContentSheet skill={skill} readFile={readFile} onClose={jest.fn()} />
    </ThemeProvider>,
  );

describe('the skill document', () => {
  it('reads the file of the skill it opened', async () => {
    const read = jest.fn(async () => '# Review');
    await show(read);
    expect(await screen.findByText('# Review')).toBeTruthy();
    expect(read).toHaveBeenCalledWith('/skills/review/SKILL.md');
  });

  it('says so when the Host cannot read it', async () => {
    await show(async () => {
      throw new Error('gone');
    });
    expect(await screen.findByTestId('skill-content-failed')).toBeTruthy();
  });
});
