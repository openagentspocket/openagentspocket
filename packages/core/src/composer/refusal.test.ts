// What a refusal says and offers: a command Chat does not send leads to the terminal, in the form
// the program runs, unless the Composer cannot take the user there.

import { describe, expect, it } from 'vitest';
import { type ComposerRefusal, refusalAction, refusalText } from './policy';

const known: ComposerRefusal = {
  kind: 'unknownCommand',
  name: 'model',
  known: true,
  terminalText: '/model ',
};
const unknown: ComposerRefusal = { ...known, name: 'frob', known: false, terminalText: '/frob ' };

describe('a refused command', () => {
  it('offers to run the typed text in the terminal', () => {
    expect(refusalAction(known, true)).toEqual({ kind: 'runInTerminal', text: '/model ' });
    expect(refusalAction(unknown, true)).toEqual({ kind: 'runInTerminal', text: '/frob ' });
  });

  it('offers nothing when the terminal cannot be reached', () => {
    expect(refusalAction(known, false)).toBeUndefined();
    expect(refusalAction({ kind: 'agentBlocked' }, false)).toBeUndefined();
  });

  it('names the command and where it runs, and says to open the terminal when there is no action', () => {
    const reachable = refusalText(known, { terminalReachable: true });
    const stranded = refusalText(known, { terminalReachable: false });
    expect(reachable).toMatchObject({ args: ['/model'] });
    expect(stranded).toMatchObject({ args: ['/model'] });
    expect(stranded).not.toEqual(reachable);
    expect(refusalText(unknown, { terminalReachable: true })).not.toEqual(reachable);
  });

  it('still offers the terminal for refusals that were never about a command', () => {
    expect(refusalAction({ kind: 'agentBlocked' }, true)).toEqual({ kind: 'showTerminal' });
    expect(refusalAction({ kind: 'commandAwaitsIdle', name: 'x' }, true)).toBeUndefined();
  });
});
