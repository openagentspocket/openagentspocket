import { describe, expect, it } from 'vitest';
import { detectSkillTrigger } from '../composer/suggestions';
import { PROGRAM_KINDS } from '../programs';
import { type AgentSkill, makeSkill, skillCommand, skillInsertionText } from './agent-skill';
import { parseSkillFrontmatter } from './frontmatter';
import {
  probedSkillFiles,
  type ResolvedSkillSource,
  readSkillFileCommand,
  SKILL_END_MARKER,
  SKILL_MAX_BYTES_PER_DOCUMENT,
  SKILL_MAX_BYTES_PER_FILE,
  skillDocumentContent,
  skillFileMarker,
  skillProbeCommand,
  skillsFromProbeOutput,
} from './probe';
import { skillSources, supportsSkills } from './source-catalog';
import { skillsMatchingTrigger, triggerQuery } from './suggestion-trigger';

const fm = (text: string) => parseSkillFrontmatter(text);

describe('frontmatter', () => {
  it('parses plain and quoted scalars', () => {
    const plain = fm('---\nname: code-review\ndescription: Review the changes.\n---\n# Body');
    expect(plain.name).toBe('code-review');
    expect(plain.description).toBe('Review the changes.');
    const quoted = fm(`---\nname: "tdd"\ndescription: 'Red, green, refactor.'\n---`);
    expect(quoted.name).toBe('tdd');
    expect(quoted.description).toBe('Red, green, refactor.');
  });

  it('folds and keeps block scalars and wrapped plain scalars', () => {
    expect(
      fm('---\ndescription: >-\n  Investigate a question\n  and capture.\n---').description,
    ).toBe('Investigate a question and capture.');
    expect(fm('---\ndescription: |\n  First.\n  Second.\n---').description).toBe('First.\nSecond.');
    expect(fm('---\ndescription: A wrapped\n  second line.\n---').description).toBe(
      'A wrapped second line.',
    );
  });

  it('parses a file without frontmatter to empty fields', () => {
    expect(fm('# Just a heading\n\nProse.')).toEqual({ isUserInvocable: true });
  });

  it('survives CRLF and a BOM', () => {
    const parsed = fm('﻿---\r\nname: crlf-skill\r\ndescription: Written on Windows.\r\n---\r\n');
    expect(parsed.name).toBe('crlf-skill');
    expect(parsed.description).toBe('Written on Windows.');
  });

  it('skips nested mappings and unknown keys, and ends at a ... fence', () => {
    const parsed = fm(
      '---\nname: complex\nmetadata:\n  type: project\nallowed-tools: Bash, Read\ndescription: Found.\n---',
    );
    expect(parsed.name).toBe('complex');
    expect(parsed.description).toBe('Found.');
    const fenced = fm('---\nname: fenced\n...\ndescription: body text\n');
    expect(fenced.name).toBe('fenced');
    expect(fenced.description).toBeUndefined();
  });

  it('reads user-invocable false case-insensitively and empty values as missing', () => {
    expect(fm('---\nuser-invocable: false\n---').isUserInvocable).toBe(false);
    expect(fm('---\nuser-invocable: "False"\n---').isUserInvocable).toBe(false);
    expect(fm('---\nuser-invocable: true\n---').isUserInvocable).toBe(true);
    const empty = fm('---\nname:\ndescription:\n---');
    expect(empty.name).toBeUndefined();
    expect(empty.description).toBeUndefined();
  });
});

const projectSource: ResolvedSkillSource = {
  scope: 'project',
  quotedDirectory: "'/home/dev/repo/.claude/skills'",
  layout: 'skillDirectories',
  commandPrefix: '/',
};
const globalSource: ResolvedSkillSource = {
  scope: 'global',
  quotedDirectory: "'/home/dev/.claude/skills'",
  layout: 'skillDirectories',
  commandPrefix: '/',
};
const claude = [projectSource, globalSource];
const m = skillFileMarker;
const framed = (index: number, path: string, body = '') =>
  `${m(index)}${path}\n${body}${body ? '\n' : ''}${SKILL_END_MARKER}\n`;

describe('probe command', () => {
  it('runs under sh with positional directories, not interpolated ones', () => {
    const command = skillProbeCommand(claude);
    expect(command.startsWith("/bin/sh -c '")).toBe(true);
    expect(
      command.endsWith(
        " herdr-skills-probe '/home/dev/repo/.claude/skills' '/home/dev/.claude/skills'",
      ),
    ).toBe(true);
    expect(command).toContain('for f in "$1"/*/SKILL.md');
    expect(command).toContain('for f in "$2"/*/SKILL.md');
    expect(command.split("'")[1]).not.toContain('/home/dev');
    expect(command).toContain(m(0));
    expect(command).toContain(m(1));
    expect(command).toContain(`head -c ${SKILL_MAX_BYTES_PER_FILE}`);
    expect(command).toContain("; exit 0'");
  });

  it('globs flat files for the markdown layout', () => {
    const command = skillProbeCommand([{ ...globalSource, layout: 'markdownFiles' }]);
    expect(command).toContain('for f in "$1"/*.md');
  });

  it('frames a capped single-document read', () => {
    const command = readSkillFileCommand("'/repo/.claude/skills/deploy/SKILL.md'");
    expect(command.endsWith(" herdr-skill-read '/repo/.claude/skills/deploy/SKILL.md'")).toBe(true);
    expect(command).toContain(`head -c ${SKILL_MAX_BYTES_PER_DOCUMENT}`);
    expect(command).toContain('[ -f "$1" ] || exit 0');
  });
});

describe('probe output', () => {
  it('parses marker-framed files and drops shell noise', () => {
    const files = probedSkillFiles(
      `Welcome to fish\n${framed(0, '/repo/.claude/skills/deploy/SKILL.md', '---\nname: deploy\n---')}` +
        framed(1, '/home/.claude/skills/tdd/SKILL.md', 'x'),
    );
    expect(files.map((file) => [file.sourceIndex, file.path])).toEqual([
      [0, '/repo/.claude/skills/deploy/SKILL.md'],
      [1, '/home/.claude/skills/tdd/SKILL.md'],
    ]);
    expect(files[0]?.content).toContain('name: deploy');
    expect(probedSkillFiles(`motd\n${SKILL_END_MARKER}\n`)).toEqual([]);
  });

  it('survives CRLF content', () => {
    const files = probedSkillFiles(
      `${m(0)}/a/SKILL.md\n---\r\nname: crlf\r\n---\r\n${SKILL_END_MARKER}\n`,
    );
    expect(parseSkillFrontmatter(files[0]?.content ?? '').name).toBe('crlf');
  });

  it('starts a fresh entry on a begin marker inside content', () => {
    const files = probedSkillFiles(
      `${m(0)}/a/SKILL.md\ncontent of a\n${m(0)}/b/SKILL.md\ncontent of b\n${SKILL_END_MARKER}\n`,
    );
    expect(files).toEqual([{ sourceIndex: 0, path: '/b/SKILL.md', content: 'content of b' }]);
  });

  it('reads a document back, and a missing one as null', () => {
    const output = `noise\n${framed(0, '/r/SKILL.md', '---\nname: deploy\n---\nThe body.')}`;
    expect(skillDocumentContent(output)).toBe('---\nname: deploy\n---\nThe body.');
    expect(skillDocumentContent('nothing but noise\n')).toBeNull();
  });
});

describe('skills pipeline', () => {
  it('names skills by layout and keeps the path', () => {
    const sources: ResolvedSkillSource[] = [
      projectSource,
      {
        scope: 'global',
        quotedDirectory: "'/h/.pi/agent/prompts'",
        layout: 'markdownFiles',
        commandPrefix: '/',
      },
    ];
    const skills = skillsFromProbeOutput(
      framed(0, '/repo/.claude/skills/no-frontmatter/SKILL.md', '# Body') +
        framed(1, '/home/.pi/agent/prompts/fix-ci.md', 'Fix it.'),
      sources,
    );
    expect(skills.map((skill) => skill.name)).toEqual(['no-frontmatter', 'fix-ci']);
    expect(skillInsertionText(skills[0] as AgentSkill)).toBe('/no-frontmatter ');
    expect(skills[0]?.path).toBe('/repo/.claude/skills/no-frontmatter/SKILL.md');
  });

  it('carries the command prefix and sorts alphabetically within a scope', () => {
    const sources: ResolvedSkillSource[] = [
      { ...globalSource, commandPrefix: '$' },
      { ...globalSource, commandPrefix: '/skill:' },
    ];
    const skills = skillsFromProbeOutput(
      framed(0, '/h/.agents/skills/plan/SKILL.md') +
        framed(1, '/h/.pi/agent/skills/pdf-tools/SKILL.md'),
      sources,
    );
    expect(skills.map(skillCommand)).toEqual(['/skill:pdf-tools', '$plan']);
  });

  it('carries user-invocable', () => {
    const skills = skillsFromProbeOutput(
      framed(0, '/r/.claude/skills/e2e-hidden/SKILL.md', '---\nuser-invocable: false\n---') +
        framed(0, '/r/.claude/skills/review/SKILL.md'),
      claude,
    );
    expect(skills.map((skill) => skill.isUserInvocable)).toEqual([false, true]);
  });

  it('lets a project skill shadow a same-commanded global one', () => {
    const skills = skillsFromProbeOutput(
      framed(0, '/r/.claude/skills/deploy/SKILL.md', '---\ndescription: Project.\n---') +
        framed(1, '/h/.claude/skills/deploy/SKILL.md', '---\ndescription: Global.\n---'),
      claude,
    );
    expect(skills).toHaveLength(1);
    expect(skills[0]?.scope).toBe('project');
    expect(skills[0]?.description).toBe('Project.');
  });

  it('sorts project first then alphabetically ignoring case', () => {
    const skills = skillsFromProbeOutput(
      framed(1, '/h/.claude/skills/zeta/SKILL.md') +
        framed(1, '/h/.claude/skills/Alpha/SKILL.md') +
        framed(0, '/r/.claude/skills/omega/SKILL.md'),
      claude,
    );
    expect(skills.map((skill) => skill.name)).toEqual(['omega', 'Alpha', 'zeta']);
  });

  it('skips unusable names and unknown source indexes', () => {
    const skills = skillsFromProbeOutput(
      framed(0, '/r/.claude/skills/has space/SKILL.md') +
        framed(0, '/r/.claude/skills/fine/SKILL.md', '---\nname: also has spaces\n---') +
        framed(9, '/elsewhere/thing/SKILL.md'),
      claude,
    );
    expect(skills.map((skill) => skill.name)).toEqual(['fine']);
  });

  it('drops control characters from descriptions', () => {
    const skills = skillsFromProbeOutput(
      framed(0, '/r/.claude/skills/clean/SKILL.md', '---\ndescription: "Safe\u001b[31m text"\n---'),
      claude,
    );
    expect(skills[0]?.description).toBe('Safe[31m text');
  });
});

describe('source catalog', () => {
  it('covers exactly the researched kinds', () => {
    const supported = PROGRAM_KINDS.map((info) => info.kind).filter(supportsSkills);
    expect(supported).toEqual([
      'pi',
      'claude',
      'codex',
      'cursor',
      'devin',
      'agy',
      'cline',
      'omp',
      'opencode',
      'copilot',
      'kimi',
      'kiro',
      'droid',
      'grok',
      'hermes',
      'kilo',
      'qodercli',
      'qwen',
    ]);
    for (const kind of ['gemini', 'amp', 'mastracode', 'maki']) {
      expect(supportsSkills(kind)).toBe(false);
    }
  });

  it('uses one prefix per kind where the Agent does', () => {
    for (const kind of ['kimi', 'omp']) {
      expect(skillSources(kind).every((source) => source.commandPrefix === '/skill:')).toBe(true);
    }
    expect(skillSources('codex').every((source) => source.commandPrefix === '$')).toBe(true);
  });

  it('lists omp roots in native-first order', () => {
    expect(skillSources('omp').map((s) => `${s.root}:${s.relativePath}`)).toEqual([
      'project:.omp/skills',
      'project:.agents/skills',
      'project:.agent/skills',
      'project:.github/skills',
      'home:.omp/agent/skills',
      'home:.agents/skills',
      'home:.agent/skills',
      'home:.omp/agent/managed-skills',
    ]);
  });

  it('probes droid commands first and keeps project sources before home ones everywhere', () => {
    expect(skillSources('droid')[0]?.relativePath).toBe('.factory/commands');
    for (const info of PROGRAM_KINDS) {
      const sources = skillSources(info.kind);
      const firstHome = sources.findIndex((source) => source.root === 'home');
      if (firstHome >= 0) {
        expect(sources.slice(firstHome).every((source) => source.root === 'home')).toBe(true);
      }
    }
  });
});

describe('suggestion trigger', () => {
  const skill = (name: string, prefix = '/', description?: string) =>
    makeSkill({ scope: 'project', name, description, commandPrefix: prefix });

  it('detects a prefix at the start, after whitespace, and the longest prefix', () => {
    expect(detectSkillTrigger('/re', ['/'])).toEqual({ token: '/re', prefix: '/', query: 're' });
    expect(triggerQuery({ token: '/re', prefix: '/', query: 're' })).toBe('re');
    expect(detectSkillTrigger('fix this /rev', ['/'])).toEqual({
      token: '/rev',
      prefix: '/',
      query: 'rev',
    });
    expect(detectSkillTrigger('line one\n$pd', ['$'])).toEqual({
      token: '$pd',
      prefix: '$',
      query: 'pd',
    });
    expect(detectSkillTrigger('/skill:pd', ['/', '/skill:'])).toEqual({
      token: '/skill:pd',
      prefix: '/skill:',
      query: 'pd',
    });
  });

  it('does not trigger inside a token, on an empty or completed token, or without a prefix', () => {
    expect(detectSkillTrigger('path/to', ['/'])).toBeUndefined();
    expect(detectSkillTrigger('us$', ['$'])).toBeUndefined();
    expect(detectSkillTrigger('', ['/'])).toBeUndefined();
    expect(detectSkillTrigger('/review ', ['/'])).toBeUndefined();
    expect(detectSkillTrigger('$pdf', ['/'])).toBeUndefined();
    expect(detectSkillTrigger('review', ['/', '$'])).toBeUndefined();
  });

  it('filters by prefix, name and description', () => {
    const skills = [
      skill('code-review', '/', 'Review a pull request'),
      skill('tdd', '/', 'REVIEW nothing'),
      skill('pdf-tools', '$'),
      skill('deploy'),
    ];
    const names = (token: string, prefix: string) =>
      skillsMatchingTrigger({ token, prefix, query: token.slice(prefix.length) }, skills).map(
        (s) => s.name,
      );
    expect(names('/', '/')).toEqual(['code-review', 'tdd', 'deploy']);
    expect(names('$pdf', '$')).toEqual(['pdf-tools']);
    expect(names('/Rev', '/')).toEqual(['code-review', 'tdd']);
    expect(names('/zzz', '/')).toEqual([]);
    expect(
      skillsMatchingTrigger({ token: '/sk', prefix: '/', query: 'sk' }, [
        skill('web', '/skill:'),
      ]).map((s) => s.name),
    ).toEqual(['web']);
  });
});
