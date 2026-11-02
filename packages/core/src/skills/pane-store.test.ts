import { describe, expect, it } from 'vitest';
import { failWith } from '../events/failure';
import { CancelledError } from '../hosts/cancellation';
import { type AgentSkill, makeSkill } from './agent-skill';
import { SkillsPaneStore } from './pane-store';

describe('SkillsPaneStore', () => {
  const global = (name: string, extra: Partial<AgentSkill> = {}) =>
    makeSkill({ scope: 'global', name, ...extra });

  it('loads once and refresh forces and replaces', async () => {
    const calls: boolean[] = [];
    const store = new SkillsPaneStore({
      fetch: async (force) => {
        calls.push(force);
        return [global(force ? 'fresh' : 'stale')];
      },
    });
    await store.loadIfNeeded();
    await store.loadIfNeeded();
    expect(calls).toEqual([false]);
    await store.refresh();
    expect(calls).toEqual([false, true]);
    expect(store.skills.map((s) => s.name)).toEqual(['fresh']);
    expect(store.phase.kind).toBe('loaded');
  });

  it('reports a failure message, keeps the list on a failed refresh, and recovers', async () => {
    let failure: Error | undefined;
    const store = new SkillsPaneStore({
      fetch: async () => {
        if (failure) throw failure;
        return [global('kept')];
      },
    });
    await store.loadIfNeeded();
    failure = failWith({ kind: 'sshUnreachable', detail: 'gone' });
    await store.refresh();
    expect(store.phase).toEqual({ kind: 'failed', message: { key: 'The Host is not connected.' } });
    expect(store.skills.map((s) => s.name)).toEqual(['kept']);
    failure = undefined;
    await store.refresh();
    expect(store.phase.kind).toBe('loaded');
    failure = failWith({ kind: 'timedOut' });
    await store.refresh();
    expect(store.phase).toEqual({
      kind: 'failed',
      message: { key: 'The Host did not answer in time.' },
    });
  });

  it('does not retry on its own after a failure, and an unavailable feature explains itself', async () => {
    let calls = 0;
    const store = new SkillsPaneStore({
      fetch: async () => {
        calls += 1;
        throw failWith({ kind: 'hostFeatureUnavailable', feature: 'Skills on native Windows' });
      },
    });
    await store.loadIfNeeded();
    await store.loadIfNeeded();
    expect(calls).toBe(1);
    expect(store.phase.kind).toBe('failed');
  });

  it('filters, lists scopes, and unites trigger prefixes longest first', async () => {
    const store = new SkillsPaneStore({
      commandPrefixes: ['/', '/skill:', '/'],
      include: (skill) => skill.commandPrefix === '/skill:' || skill.name !== 'quit',
      fetch: async () => [
        makeSkill({ scope: 'project', name: 'code-review', description: 'Review a pull request' }),
        makeSkill({ scope: 'global', name: 'tdd', description: 'Red, green, refactor' }),
        makeSkill({ scope: 'global', name: 'pdf-tools', commandPrefix: '$' }),
        makeSkill({ scope: 'global', name: 'quit' }),
      ],
    });
    expect(store.triggerPrefixes).toEqual(['/skill:', '/']);
    await store.loadIfNeeded();
    expect(store.triggerPrefixes).toEqual(['/skill:', '$', '/']);
    expect(store.skills.map((s) => s.name)).toEqual(['code-review', 'tdd', 'pdf-tools']);
    expect(store.projectSkills).toHaveLength(1);
    expect(store.globalSkills).toHaveLength(2);
    expect(store.matching('REVIEW').map((s) => s.name)).toEqual(['code-review']);
    expect(store.matching('$pdf').map((s) => s.name)).toEqual(['pdf-tools']);
    expect(store.matching('absent')).toEqual([]);
  });

  it('returns to idle on cancellation so the next appearance retries', async () => {
    let attempts = 0;
    const store = new SkillsPaneStore({
      fetch: async () => {
        attempts += 1;
        if (attempts === 1) throw new CancelledError();
        return [global('second-try')];
      },
    });
    await store.loadIfNeeded();
    expect(store.phase.kind).toBe('idle');
    await store.loadIfNeeded();
    expect(store.skills.map((s) => s.name)).toEqual(['second-try']);
  });
});
