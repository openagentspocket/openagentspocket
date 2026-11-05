import { type AgentSkill, makeSkill } from '@openagentspocket/core';
import { render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { useAgentSkills } from './useAgentSkills';

const review: AgentSkill = makeSkill({
  name: 'review',
  description: 'Review the diff',
  scope: 'global',
  commandPrefix: '/',
  path: '/home/dev/.claude/skills/review/SKILL.md',
});

function Names(props: Parameters<typeof useAgentSkills>[0]) {
  const skills = useAgentSkills(props);
  return <Text testID="names">{skills.map((skill) => skill.name).join(',')}</Text>;
}

describe('useAgentSkills', () => {
  it('lists nothing until loaded, then the Host skills of the Agent kind in its directory', async () => {
    const fetchSkills = jest.fn(async () => [review]);
    await render(
      <Names hostId="h1" program="claude" projectRoot="/work/api" fetchSkills={fetchSkills} />,
    );
    await waitFor(() => expect(screen.getByTestId('names').props.children).toBe('review'));
    expect(fetchSkills).toHaveBeenCalledTimes(1);
    expect(fetchSkills).toHaveBeenCalledWith({
      hostId: 'h1',
      kind: 'claude',
      projectRoot: '/work/api',
    });
  });

  it('waits until something asks for them', async () => {
    const fetchSkills = jest.fn(async () => [review]);
    await render(<Names hostId="h1" program="claude" enabled={false} fetchSkills={fetchSkills} />);
    expect(screen.getByTestId('names').props.children).toBe('');
    expect(fetchSkills).not.toHaveBeenCalled();
  });

  it('stays empty when the Host cannot list them', async () => {
    const fetchSkills = jest.fn(async () => {
      throw new Error('no exec');
    });
    await render(<Names hostId="h1" program="claude" fetchSkills={fetchSkills} />);
    await waitFor(() => expect(fetchSkills).toHaveBeenCalled());
    expect(screen.getByTestId('names').props.children).toBe('');
  });
});
