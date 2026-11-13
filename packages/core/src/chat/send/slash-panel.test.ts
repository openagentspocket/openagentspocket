import '../programs';
import { describe, expect, it } from 'vitest';
import { type AgentSkill, makeSkill } from '../../skills/agent-skill';
import { CHAT_PROGRAMS } from '../model/types';
import { programCommands } from '../programs/registry';
import { chatCommands } from './command-menu';
import { sendPolicyFor, sendPolicyForAgent } from './registry';
import { createSendRules } from './rules';
import { type SlashPanelInput, slashPanel } from './slash-panel';

const SKILLS: readonly AgentSkill[] = [
  makeSkill({ scope: 'global', name: 'code-review', description: 'Review the branch' }),
  makeSkill({ scope: 'project', name: 'deploy', description: 'Ship the model to staging' }),
];

function panel(
  program: string,
  surface: 'chat' | 'terminal',
  draft: string,
  overrides: Partial<SlashPanelInput> = {},
) {
  const policy = sendPolicyForAgent(program);
  const skills = overrides.skills ?? SKILLS;
  const result = slashPanel({
    draft,
    surface,
    program,
    policy,
    chatMenu: policy && surface === 'chat' ? chatCommands(skills, true, policy) : [],
    skills,
    terminalReachable: true,
    ...overrides,
  });
  if (!result) throw new Error(`no panel for ${draft}`);
  return result;
}

const names = (entries: readonly { name: string }[]) => entries.map((entry) => entry.name);

describe('the / panel', () => {
  it('stays closed without a leading slash, after a space, or on a path', () => {
    for (const draft of ['', 'hello', '/model opus', '/usr/bin']) {
      expect(
        slashPanel({
          draft,
          surface: 'chat',
          program: 'claude',
          policy: sendPolicyFor('claude'),
          chatMenu: [],
          skills: SKILLS,
          terminalReachable: true,
        }),
      ).toBeNull();
    }
  });

  it("lists every program's whole menu and the skills on both surfaces", () => {
    for (const program of CHAT_PROGRAMS) {
      for (const surface of ['chat', 'terminal'] as const) {
        const result = panel(program, surface, '/');
        expect(names(result.commands)).toEqual(
          programCommands(program).map((command) => command.command),
        );
        // Chat lists the skills its policy offers (`offersSkill`); the terminal, every one.
        if (surface === 'terminal')
          expect(names(result.skills)).toEqual(['/code-review', '/deploy']);
      }
    }
  });

  it('puts the built-ins Claude Code users look for in its menu', () => {
    const listed = names(panel('claude', 'chat', '/').commands);
    for (const name of ['/model', '/effort', '/clear', '/resume', '/context', '/compact']) {
      expect(listed).toContain(name);
    }
  });

  it('filters by the typed name, best matches first, then by title and description', () => {
    const result = panel('claude', 'chat', '/mo');
    // Prefix matches (`/model`) before a name that only contains the query (`/memory` does not).
    expect(names(result.commands)[0]).toBe('/model');
    expect(names(result.commands)).not.toContain('/clear');
    // A skill matches by its description too.
    expect(names(result.skills)).toEqual(['/deploy']);
    const exact = panel('claude', 'terminal', '/resume');
    expect(names(exact.commands)[0]).toBe('/resume');
  });

  it('ranks an exact name first even when the list puts it later', () => {
    const result = panel('claude', 'chat', '/plan');
    expect(names(result.commands)[0]).toBe('/plan');
  });

  describe('picking a command', () => {
    it('keeps a conversation command in Chat, enabled only while idle', () => {
      const compact = panel('claude', 'chat', '/comp').commands.find((c) => c.name === '/compact');
      expect(compact).toMatchObject({ surface: 'chat', text: '/compact ', enabled: true });
      const policy = sendPolicyFor('claude');
      const busy = panel('claude', 'chat', '/comp', {
        chatMenu: chatCommands([], false, policy),
      }).commands.find((c) => c.name === '/compact');
      expect(busy?.enabled).toBe(false);
    });

    it('moves a terminal command picked on Chat to the terminal, typed as the program runs it', () => {
      for (const program of CHAT_PROGRAMS) {
        const policy = sendPolicyFor(program);
        const rules = createSendRules(policy, chatCommands([], true, policy));
        for (const command of panel(program, 'chat', '/', { skills: [] }).commands) {
          if (command.surface === 'chat') {
            // What stays in Chat is what Chat's rules send.
            expect(rules.validate(command.text)).toBeUndefined();
            continue;
          }
          // Everything else is what Chat refuses, with the same text "Run in Terminal" types.
          const refusal = rules.validate(command.name);
          expect(refusal?.kind).toBe('unknownCommand');
          if (refusal?.kind === 'unknownCommand') {
            expect(refusal.known).toBe(true);
            expect(refusal.terminalText).toBe(command.text);
          }
        }
      }
    });

    it('types every command into the terminal draft on the terminal', () => {
      const result = panel('opencode', 'terminal', '/');
      expect(result.commands.every((command) => command.surface === 'terminal')).toBe(true);
      expect(result.commands.find((c) => c.name === '/sessions')?.text).toBe('/sessions');
      expect(panel('claude', 'terminal', '/mod').commands[0]?.text).toBe('/model ');
    });

    it('leaves out what runs on the terminal when the Composer cannot go there', () => {
      const result = panel('claude', 'chat', '/', { terminalReachable: false });
      expect(names(result.commands)).toEqual(['/compact', '/context']);
    });
  });

  describe('skills', () => {
    it('insert in Chat as /name, for Chat to send in the program form', () => {
      const result = panel('codex', 'chat', '/dep', {
        skills: [makeSkill({ scope: 'global', name: 'deploy', commandPrefix: '$' })],
      });
      expect(result.skills).toEqual([{ name: '/deploy', description: null, text: '/deploy ' }]);
    });

    it('insert on the terminal as the program types them', () => {
      const result = panel('codex', 'terminal', '/dep', {
        skills: [makeSkill({ scope: 'global', name: 'deploy', commandPrefix: '$' })],
      });
      expect(result.skills).toEqual([{ name: '$deploy', description: null, text: '$deploy ' }]);
      const pi = panel('pi', 'terminal', '/skill:pd', {
        skills: [makeSkill({ scope: 'global', name: 'pdf', commandPrefix: '/skill:' })],
      });
      expect(names(pi.skills)).toEqual(['/skill:pdf']);
    });

    it('hide a command of the same name, as the program runs the skill', () => {
      const result = panel('claude', 'terminal', '/', {
        skills: [makeSkill({ scope: 'global', name: 'init' })],
      });
      expect(names(result.commands)).not.toContain('/init');
      expect(names(result.skills)).toEqual(['/init']);
    });

    it('can be none: the commands still show', () => {
      const result = panel('claude', 'chat', '/', { skills: [] });
      expect(result.skills).toEqual([]);
      expect(result.commands.length).toBeGreaterThan(10);
    });
  });

  it('gives a program Chat does not know only the skills', () => {
    const result = panel('some-new-agent', 'terminal', '/');
    expect(result.commands).toEqual([]);
    expect(names(result.skills)).toEqual(['/code-review', '/deploy']);
  });
});
