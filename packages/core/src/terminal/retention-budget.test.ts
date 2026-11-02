import { describe, expect, it } from 'vitest';
import { CancelledError, createCancellation } from '../hosts/cancellation';
import { RetentionFailure, TerminalRetentionBudget } from './retention-budget';

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

class Gate {
  private release!: () => void;
  readonly opened = new Promise<void>((resolve) => {
    this.release = resolve;
  });
  entered = false;
  open() {
    this.release();
  }
}

const key = (terminalId: string, hostId = 'h') => ({ hostId, terminalId });

describe('TerminalRetentionBudget', () => {
  it('evicts the least recently used idle terminal and waits for its teardown', async () => {
    const budget = new TerminalRetentionBudget(3);
    const gate = new Gate();
    const evicted: string[] = [];
    const idle = (name: string, wait?: Gate) => async () => {
      if (wait) {
        wait.entered = true;
        await wait.opened;
      }
      evicted.push(name);
    };
    await budget.admit({ key: key('a'), ownerId: 'o', isVisible: () => false, onEvict: idle('a') });
    await budget.admit({
      key: key('b'),
      ownerId: 'o',
      isVisible: () => false,
      onEvict: idle('b', gate),
    });
    await budget.admit({ key: key('c'), ownerId: 'o', isVisible: () => true, onEvict: idle('c') });
    budget.touch(key('a'), 'o');
    const next = budget.admit({
      key: key('d'),
      ownerId: 'o',
      isVisible: () => true,
      onEvict: idle('d'),
    });
    await settle();
    expect(gate.entered).toBe(true);
    expect(evicted).toEqual([]);
    gate.open();
    await next;
    expect(evicted).toEqual(['b']);
  });

  it('never evicts visible owners, and Hosts have independent budgets', async () => {
    const budget = new TerminalRetentionBudget(1);
    await budget.admit({
      key: key('one'),
      ownerId: 'o',
      isVisible: () => true,
      onEvict: async () => expect.fail('visible owner was evicted'),
    });
    await expect(
      budget.admit({
        key: key('two'),
        ownerId: 'o',
        isVisible: () => true,
        onEvict: async () => {},
      }),
    ).rejects.toMatchObject({ kind: 'allConnectionsVisible' });
    await budget.admit({
      key: key('one', 'other'),
      ownerId: 'o',
      isVisible: () => true,
      onEvict: async () => {},
    });
  });

  it('refuses a second visible owner but transfers after idle teardown', async () => {
    const budget = new TerminalRetentionBudget();
    let visible = true;
    let ended = false;
    await budget.admit({
      key: key('t'),
      ownerId: 'first',
      isVisible: () => visible,
      onEvict: async () => {
        ended = true;
      },
    });
    const second = {
      key: key('t'),
      ownerId: 'second',
      isVisible: () => true,
      onEvict: async () => {},
    };
    const refusal = await budget.admit(second).catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(RetentionFailure);
    expect(refusal).toMatchObject({ kind: 'alreadyVisible' });
    expect(ended).toBe(false);
    visible = false;
    await budget.admit(second);
    expect(ended).toBe(true);
  });

  it('returns a cancelled admission at once without letting successors skip the queue', async () => {
    const budget = new TerminalRetentionBudget(1);
    const gate = new Gate();
    const evicted: string[] = [];
    await budget.admit({
      key: key('one'),
      ownerId: 'o',
      isVisible: () => false,
      onEvict: async () => {
        gate.entered = true;
        await gate.opened;
        evicted.push('one');
      },
    });
    const replacing = budget.admit({
      key: key('two'),
      ownerId: 'o',
      isVisible: () => false,
      onEvict: async () => {
        evicted.push('two');
      },
    });
    await settle();
    const cancellation = createCancellation();
    const cancelled = budget.admit({
      key: key('cancelled'),
      ownerId: 'o',
      isVisible: () => true,
      onEvict: async () => {},
      signal: cancellation.signal,
    });
    cancellation.cancel();
    await expect(cancelled).rejects.toBeInstanceOf(CancelledError);
    let entered = false;
    const successor = budget
      .admit({ key: key('three'), ownerId: 'o', isVisible: () => true, onEvict: async () => {} })
      .then(() => {
        entered = true;
      });
    await settle();
    expect(entered).toBe(false);
    gate.open();
    await replacing;
    await successor;
    expect(evicted).toEqual(['one', 'two']);
  });
});
