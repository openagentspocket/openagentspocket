import { describe, expect, it } from 'vitest';
import type { ComposerRefusal } from '../../composer/policy';
import { makeSkill } from '../../skills/agent-skill';
import { chatCommands, chatInsertionText, commandSuggestions } from './command-menu';
import { conservativeSendPolicy } from './defaults';
import { sendPolicyFor } from './registry';
import { createSendRules } from './rules';
import { rulesFor, SKILLS } from './send.testkit';

const unsafe = (reason: string): ComposerRefusal => ({ kind: 'unsafeText', reason });
const SHELL = 'A message starting with ! runs a shell command. Open the terminal to run one.';

describe('Chat send rules', () => {
  describe.each(['claude', 'codex', 'pi', 'omp', 'grok', 'opencode'] as const)('%s', (program) => {
    it.each(['!ls', '  !rm -rf build', '!'])('never sends a shell escape: %j', (draft) => {
      expect(rulesFor(program).validate(draft)).toEqual(unsafe(SHELL));
    });

    it.each(['@src/main.swift fix it', '$deploy now', 'café ☕'])(
      'lets mentions and dollar words through: %j',
      (draft) => {
        const rules = rulesFor(program);
        expect(rules.validate(draft)).toBeUndefined();
        expect(rules.outgoingText(draft)).toBe(`${draft} `);
      },
    );
  });

  it.each(['exit', 'quit', ':q', ':q!', ':wq', ':wq!', '  exit\n', 'Quit'])(
    "never sends Claude Code's exit word %j",
    (draft) => {
      expect(rulesFor('claude').validate(draft)?.kind).toBe('unsafeText');
    },
  );

  it('words the exit refusal with the program name and leaves q alone', () => {
    const rules = rulesFor('claude');
    expect(rules.validate(':wq')).toEqual(
      unsafe('Sending this would exit Claude Code. Open the terminal to exit.'),
    );
    expect(rules.validate('q')).toBeUndefined();
    expect(rules.validate('exit the loop')).toBeUndefined();
  });

  it.each(['exit', ':q'])('lets Codex take %j as text', (draft) => {
    expect(rulesFor('codex').validate(draft)).toBeUndefined();
  });

  it('never sends control bytes', () => {
    expect(rulesFor('claude').validate('a\u001b[201~b')).toEqual(
      unsafe('The message contains terminal control characters.'),
    );
    expect(rulesFor('codex').validate('!ls')).toEqual(unsafe(SHELL));
  });

  describe('profiles', () => {
    const profiled = (profile: Parameters<typeof conservativeSendPolicy>[2]) =>
      createSendRules(
        conservativeSendPolicy('codex', 'Codex', { offersSkill: () => true, ...profile }),
        chatCommands(
          SKILLS.map((skill) => ({ ...skill, commandPrefix: '$' })),
          true,
          {
            ...sendPolicyFor('codex'),
          },
        ),
      );

    it("refuses a profile's exit words in the program's name", () => {
      const rules = profiled({ profile: { exitWords: new Set(['bye']) } });
      expect(rules.validate('  BYE \n')).toEqual(
        unsafe('Sending this would exit Codex. Open the terminal to exit.'),
      );
      expect(rules.validate('bye now')).toBeUndefined();
    });

    it('checks the profile refusal after the shared rules', () => {
      const rules = profiled({
        profile: {
          exitWords: new Set(),
          refusal: (clean) =>
            clean.includes('/btw') ? unsafe('Side questions stay in the terminal.') : undefined,
        },
      });
      expect(rules.validate('ask /btw why')).toEqual(
        unsafe('Side questions stay in the terminal.'),
      );
      expect(rules.validate('!ls /btw')).toEqual(unsafe(SHELL));
      expect(rules.validate('plain')).toBeUndefined();
    });

    it('sends a bare command alone and refuses arguments', () => {
      const rules = profiled({
        profile: {
          exitWords: new Set(),
          submission: (command) =>
            command.kind.type === 'compact'
              ? { kind: 'bare', argumentsRefusal: 'No focus here.' }
              : { kind: 'trailingSpace' },
        },
      });
      expect(rules.outgoingText('  /compact \n')).toBe('/compact');
      expect(rules.validate('/compact keep notes')).toEqual({
        kind: 'commandUnavailable',
        reason: 'No focus here.',
      });
      expect(rules.outgoingText('/review the diff')).toBe('$review the diff ');
    });
  });

  describe('commands', () => {
    it('sends Claude skills as typed and Codex skills with their dollar prefix', () => {
      const claude = rulesFor('claude');
      expect(claude.validate('/review the diff')).toBeUndefined();
      expect(claude.outgoingText('/review the diff')).toBe('/review the diff ');
      expect(claude.outgoingText('  /deploy')).toBe('/deploy ');
      const codex = rulesFor('codex');
      expect(codex.outgoingText('/review the diff')).toBe('$review the diff ');
      expect(codex.outgoingText('/deploy')).toBe('$deploy ');
    });

    it("sends a picked skill in the program's own form", () => {
      const skill = makeSkill({ scope: 'project', name: 'review', commandPrefix: '/skill:' });
      expect(chatInsertionText(skill)).toBe('/review ');
      const policy = conservativeSendPolicy('claude', 'Claude Code', { offersSkill: () => true });
      const rules = createSendRules(policy, chatCommands([skill], true, policy));
      expect(rules.outgoingText(`${chatInsertionText(skill)}the diff`)).toBe(
        '/skill:review the diff ',
      );
    });

    it('offers /compact only while idle, ahead of a skill of the same name', () => {
      const idle = rulesFor('codex');
      const busy = rulesFor('codex', { idle: false });
      expect(
        idle.commands.filter((command) => command.name === 'compact').map((c) => c.kind),
      ).toEqual([{ type: 'compact' }]);
      expect(idle.outgoingText('/compact')).toBe('/compact ');
      expect(busy.validate('/compact')).toEqual({ kind: 'commandAwaitsIdle', name: 'compact' });
    });

    it.each(['claude', 'codex'] as const)(
      'keeps /compact arguments and trailing space for %s',
      (program) => {
        const rules = rulesFor(program);
        expect(rules.validate('/compact')).toBeUndefined();
        expect(rules.outgoingText('/compact')).toBe('/compact ');
        expect(rules.outgoingText('/compact keep the API notes')).toBe(
          '/compact keep the API notes ',
        );
      },
    );

    it.each(['/usr/bin/env python3', '/tmp/a.txt is missing'])(
      'reads a leading path as text: %j',
      (draft) => {
        const rules = rulesFor('claude');
        expect(rules.read(draft)).toEqual({ kind: 'text' });
        expect(rules.outgoingText(draft)).toBe(`${draft} `);
      },
    );

    it.each(['/model', '/', '/ review', '/Review'])(
      'refuses a command outside the menu: %j',
      (draft) => {
        expect(rulesFor('claude').validate(draft)?.kind).toBe('unknownCommand');
      },
    );

    it('reads a slash word mid-message as text', () => {
      const rules = rulesFor('codex');
      expect(rules.read('please run /review later')).toEqual({ kind: 'text' });
      expect(rules.outgoingText('please run /review later')).toBe('please run /review later ');
    });

    it('hides a skill that is not user-invocable from Claude, not from Codex', () => {
      const catalog = [
        makeSkill({ scope: 'project', name: 'review' }),
        makeSkill({ scope: 'project', name: 'e2e-hidden', isUserInvocable: false }),
      ];
      const claude = rulesFor('claude', { skills: catalog });
      expect(claude.commands.map((command) => command.name)).toEqual(['compact', 'review']);
      expect(claude.validate('/e2e-hidden')).toEqual({
        kind: 'unknownCommand',
        name: 'e2e-hidden',
      });
      expect(rulesFor('codex', { skills: catalog }).commands.map((c) => c.name)).toEqual([
        'compact',
        'review',
        'e2e-hidden',
      ]);
    });
  });

  describe('text', () => {
    it('sends exactly one trailing space', () => {
      const rules = rulesFor('claude');
      expect(rules.outgoingText('hello')).toBe('hello ');
      expect(rules.outgoingText('hello   \n\n')).toBe('hello ');
      expect(rules.outgoingText('line one\nline two')).toBe('line one\nline two ');
    });

    it('removes invisible characters', () => {
      const rules = rulesFor('claude');
      const draft = 'a​b‮c️d\u{e0041}e﻿';
      expect(rules.validate(draft)).toBeUndefined();
      expect(rules.outgoingText(draft)).toBe('abcde ');
    });

    it('turns carriage returns into line feeds', () => {
      expect(rulesFor('claude').outgoingText('a\r\nb\rc')).toBe('a\nb\nc ');
    });
  });

  describe('menu', () => {
    it('reads a skill form only for skill commands', () => {
      const rules = rulesFor('claude');
      expect(rules.validate('/skill:review')).toEqual({
        kind: 'unknownCommand',
        name: 'skill:review',
      });
      expect(commandSuggestions('/skill:', rules.commands)).toEqual([]);
    });

    it('opens only on a leading slash before a space', () => {
      const { commands } = rulesFor('claude');
      expect(commandSuggestions('/', commands)?.map((c) => c.name)).toEqual([
        'compact',
        'review',
        'deploy',
      ]);
      expect(commandSuggestions('/re', commands)?.map((c) => c.name)).toEqual(['review']);
      expect(commandSuggestions('/review ', commands)).toBeNull();
      expect(commandSuggestions(' /re', commands)).toBeNull();
      expect(commandSuggestions('/usr/', commands)).toBeNull();
      expect(commandSuggestions('hello', commands)).toBeNull();
    });
  });
});
