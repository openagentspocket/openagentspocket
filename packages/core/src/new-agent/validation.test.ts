import { describe, expect, it } from 'vitest';
import { agentNameError, defaultAgentName, gitBranchNameError } from './validation';

describe('agentNameError', () => {
  it('accepts the server rule and refuses everything else', () => {
    for (const name of ['claude', 'claude-2', 'a', 'a_b-c9', 'a'.repeat(32)]) {
      expect(agentNameError(name)).toBeUndefined();
    }
    for (const name of ['', 'Claude', '2fast', '-x', '_x', 'has space', 'ünï', 'a'.repeat(33)]) {
      expect(agentNameError(name)).toBeDefined();
    }
  });
});

describe('defaultAgentName', () => {
  it('uses the kind, then the first free numeric suffix', () => {
    expect(defaultAgentName('claude', new Set())).toBe('claude');
    expect(defaultAgentName('claude', new Set(['claude']))).toBe('claude-2');
    expect(defaultAgentName('claude', new Set(['claude', 'claude-2', 'claude-4']))).toBe(
      'claude-3',
    );
  });
});

describe('gitBranchNameError', () => {
  it('accepts ordinary branch names', () => {
    for (const name of ['main', 'feature/login', 'fix_1.2', 'worktree/x-1']) {
      expect(gitBranchNameError(name)).toBeUndefined();
    }
  });

  it('names the violated rule', () => {
    const refused = [
      '@',
      '-flag',
      'has space',
      'tilde~',
      'a:b',
      'q?',
      'star*',
      'br[ack',
      'back\\slash',
      'a..b',
      'a@{b',
      '/lead',
      'trail/',
      'a//b',
      'dot.',
      '.hidden',
      'a/.hidden',
      'topic.lock',
      'a/topic.lock/b',
      'tab\there',
    ];
    for (const name of refused) expect(gitBranchNameError(name), name).toBeDefined();
  });

  it('keeps distinct messages per rule', () => {
    const keys = new Set(
      ['@', '-x', 'a b', 'a..b', '/x', 'x.', '.x'].map((name) => {
        const error = gitBranchNameError(name);
        return typeof error === 'object' && 'key' in error ? error.key : undefined;
      }),
    );
    expect(keys.size).toBe(7);
  });
});
