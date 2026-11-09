import { describe, expect, it } from 'vitest';
import { integrationStatuses, programInPane, undetectedProgramNotice } from './agent-integrations';

const pane = (...processes: { name: string; argv0?: string; argv?: string[] }[]) => ({
  pane_id: 'w1:p7',
  foreground_processes: processes.map((process, pid) => ({ pid, ...process })),
});

describe('the program a pane runs, when herdr detects no Agent in it', () => {
  it('names a program herdr has an integration for, by its binary', () => {
    expect(programInPane(pane({ name: 'hermes', argv0: 'hermes' }))?.id).toBe('hermes');
    expect(programInPane(pane({ name: '2.1.319', argv0: 'claude', argv: ['claude'] }))?.id).toBe(
      'claude',
    );
  });

  it('finds a program run through an interpreter or another user', () => {
    const python = pane({ name: 'python3', argv: ['/usr/bin/python3', '/opt/hermes/bin/hermes'] });
    expect(programInPane(python)?.id).toBe('hermes');
    const sudo = pane({ name: 'sudo', argv: ['sudo', '-u', 'hermes', 'hermes', 'chat'] });
    expect(programInPane(sudo)).toMatchObject({ id: 'hermes', otherUser: true });
  });

  it('names nothing for a shell or a program herdr does not know', () => {
    expect(programInPane(pane({ name: 'zsh', argv0: '-zsh' }))).toBeNull();
    expect(programInPane(pane({ name: 'vim', argv0: 'vim' }))).toBeNull();
  });
});

describe('herdr integration status', () => {
  it('reads each line', () => {
    const status = integrationStatuses(
      [
        'pi: not installed (/home/u/.pi/agent/extensions/herdr-agent-state.ts)',
        'claude: current (v11) (/home/u/.claude/hooks/herdr-agent-state.sh)',
        'letta (experimental): not installed (/home/u/.letta/hooks/x.sh)',
        'codex: outdated (v3) (/home/u/.codex/herdr-agent-state.sh)',
      ].join('\n'),
    );
    expect(status.get('pi')).toBe('missing');
    expect(status.get('claude')).toBe('installed');
    expect(status.get('letta')).toBe('missing');
    expect(status.get('codex')).toBe('outdated');
  });
});

describe('what Chat says about a program herdr does not report', () => {
  const hermes = { id: 'hermes', label: 'Hermes Agent', otherUser: false };

  it('offers to install a missing or outdated integration', () => {
    expect(undetectedProgramNotice(hermes, new Map([['hermes', 'missing']]))).toEqual({
      kind: 'install',
      program: hermes,
    });
    expect(undetectedProgramNotice(hermes, new Map([['hermes', 'outdated']]))?.kind).toBe(
      'install',
    );
  });

  it('says a program run as another user cannot report, whatever is installed', () => {
    const other = { ...hermes, otherUser: true };
    expect(undetectedProgramNotice(other, new Map([['hermes', 'missing']]))?.kind).toBe(
      'otherUser',
    );
  });

  it('asks for a restart once the integration is in place', () => {
    expect(undetectedProgramNotice(hermes, new Map([['hermes', 'installed']]))?.kind).toBe(
      'restart',
    );
  });

  it('says nothing it cannot back: no program, or no status read yet', () => {
    expect(undetectedProgramNotice(null, new Map())).toBeNull();
    expect(undetectedProgramNotice(hermes, null)).toBeNull();
  });
});
