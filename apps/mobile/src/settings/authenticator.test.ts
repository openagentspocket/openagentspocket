import { type AuthResult, guardAuthenticator } from './authenticator';

function subject(results: AuthResult[]) {
  const state = { now: 0, running: 0, most: 0, asked: 0 };
  const authenticator = guardAuthenticator(
    async () => 'Face ID',
    async () => {
      state.asked += 1;
      state.running += 1;
      state.most = Math.max(state.most, state.running);
      await Promise.resolve();
      state.running -= 1;
      return results.shift() ?? 'success';
    },
    () => state.now,
  );
  return { authenticator, state };
}

describe('the device owner check', () => {
  it('shows one prompt at a time: a second one would cancel the first', async () => {
    const { authenticator, state } = subject([]);
    await Promise.all([authenticator.authenticate('a'), authenticator.authenticate('b')]);
    expect(state.most).toBe(1);
    expect(authenticator.isPrompting()).toBe(false);
  });

  it('lets a recent unlock cover the keys, only inside the window', async () => {
    const { authenticator, state } = subject([]);
    await authenticator.authenticate('app lock');
    state.now = 9_999;
    expect(await authenticator.authenticate('keys', { reuseWithinMs: 10_000 })).toBe('success');
    expect(state.asked).toBe(1);
    state.now = 10_000;
    await authenticator.authenticate('keys', { reuseWithinMs: 10_000 });
    expect(state.asked).toBe(2);
  });

  it('a refusal covers nothing', async () => {
    const { authenticator, state } = subject(['cancelled']);
    await authenticator.authenticate('app lock');
    await authenticator.authenticate('keys', { reuseWithinMs: 10_000 });
    expect(state.asked).toBe(2);
  });
});
