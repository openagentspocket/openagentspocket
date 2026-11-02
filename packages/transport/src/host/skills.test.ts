import { SKILL_END_MARKER, skillFileMarker, type TransportFailure } from '@openagentspocket/core';
import type { FakeSession } from 'agentico-ssh';
import { describe, expect, it } from 'vitest';
import { HOME_MARKER } from '../settings';
import { connected } from '../test-helpers';
import { listSkills, readSkillFile } from './skills';

const ok = (stdout: string, exitCode = 0) => ({ exitCode, stdout, stderr: '' });

async function setup(answer: (command: string) => string) {
  const { transport, ssh } = await connected(() => new Uint8Array());
  const session = ssh.sessions[0] as FakeSession;
  const commands: string[] = [];
  session.exec = async (command: string) => {
    commands.push(command);
    return ok(command.includes(HOME_MARKER) ? `${HOME_MARKER}/home/dev\n` : answer(command));
  };
  return { transport, commands };
}

const framed = (index: number, path: string, body = '') =>
  `${skillFileMarker(index)}${path}\n${body}\n${SKILL_END_MARKER}\n`;

describe('listSkills', () => {
  it('probes the Host home and the project root in one exec and parses the skills', async () => {
    const { transport, commands } = await setup(
      () =>
        framed(0, '/work/repo/.claude/skills/deploy/SKILL.md', '---\ndescription: Ship it.\n---') +
        framed(1, '/home/dev/.claude/skills/tdd/SKILL.md'),
    );
    const skills = await listSkills(transport, { kind: 'claude', projectRoot: '/work/repo/' });
    expect(skills.map((skill) => [skill.scope, skill.name])).toEqual([
      ['project', 'deploy'],
      ['global', 'tdd'],
    ]);
    const probe = commands.find((command) => command.includes('herdr-skills-probe'));
    expect(probe).toContain("'/work/repo/.claude/skills' '/home/dev/.claude/skills'");
  });

  it('skips project sources without a project root', async () => {
    const { transport, commands } = await setup(() => '');
    await listSkills(transport, { kind: 'claude' });
    const probe = commands.find((command) => command.includes('herdr-skills-probe'));
    expect(probe?.endsWith("herdr-skills-probe '/home/dev/.claude/skills'")).toBe(true);
  });

  it('lists nothing, without a round trip, for a kind with no catalog', async () => {
    const { transport, commands } = await setup(() => '');
    expect(await listSkills(transport, { kind: 'gemini', projectRoot: '/r' })).toEqual([]);
    expect(commands).toEqual([]);
  });
});

describe('readSkillFile', () => {
  it('returns the framed document', async () => {
    const { transport, commands } = await setup(() =>
      framed(0, '/r/.claude/skills/a/SKILL.md', 'The body.'),
    );
    expect(await readSkillFile(transport, '/r/.claude/skills/a/SKILL.md')).toBe('The body.');
    expect(commands[0]).toContain("herdr-skill-read '/r/.claude/skills/a/SKILL.md'");
  });

  it('fails when the file is gone and when the path cannot be quoted', async () => {
    const { transport } = await setup(() => 'noise\n');
    const gone = (await readSkillFile(transport, '/r/a.md').catch((e) => e)) as TransportFailure;
    expect(gone.error.kind).toBe('malformedResponse');
    const bad = (await readSkillFile(transport, "/r/it's.md").catch((e) => e)) as TransportFailure;
    expect(bad.error.kind).toBe('channelFailed');
  });
});
