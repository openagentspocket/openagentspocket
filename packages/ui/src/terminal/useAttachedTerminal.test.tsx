import {
  AttachTerminalStore,
  ScriptedTerminalSession,
  scriptedRunner,
} from '@openagentspocket/core';
import { act, screen } from '@testing-library/react-native';
import { utf8Encode } from 'agentico-ssh';
import { renderThemed } from '../test-utils';
import { TerminalView } from './TerminalView';
import { type AttachedTerminal, useAttachedTerminal } from './useAttachedTerminal';

function Harness({
  store,
  onTerminal,
}: {
  store: AttachTerminalStore;
  onTerminal: (terminal: AttachedTerminal) => void;
}) {
  const terminal = useAttachedTerminal(store);
  onTerminal(terminal);
  return (
    <TerminalView renderer="plain" key={terminal.snapshot.surfaceId} {...terminal.viewProps} />
  );
}

async function mount() {
  const session = new ScriptedTerminalSession();
  const { runner, requests } = scriptedRunner([async () => ({ session, generation: 1 })]);
  const store = new AttachTerminalStore({ target: 'pane-1', runTerminal: runner });
  let latest: AttachedTerminal | undefined;
  await renderThemed(<Harness store={store} onTerminal={(terminal) => (latest = terminal)} />);
  const terminal = () => {
    if (!latest) throw new Error('not rendered');
    return latest;
  };
  return { store, session, requests, terminal };
}

const text = (chunk: Uint8Array) => String.fromCharCode(...chunk);

describe('useAttachedTerminal', () => {
  it('opens the session from the view grid, paints output, and sends typing to the PTY', async () => {
    const { session, requests, terminal } = await mount();
    await act(async () => terminal().viewProps.onResize?.(100, 30));
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ cols: 100, rows: 30 });

    await act(async () => session.emit(utf8Encode('hello')));
    expect(screen.getByTestId('terminal-screen').props.children).toBe('hello');
    expect(terminal().snapshot.status.kind).toBe('live');

    await act(async () => terminal().viewProps.onInput?.('ls\r'));
    expect(session.sent.map(text)).toEqual(['ls\r']);
  });

  it('carries a window-change for a later grid without reattaching', async () => {
    const { session, requests, terminal } = await mount();
    await act(async () => terminal().viewProps.onResize?.(80, 24));
    await act(async () => terminal().viewProps.onResize?.(90, 30));
    expect(requests).toHaveLength(1);
    expect(session.sizes).toEqual([[90, 30]]);
  });

  it('sends multi-byte typing as UTF-8', async () => {
    const { session, terminal } = await mount();
    await act(async () => terminal().viewProps.onResize?.(80, 24));
    await act(async () => terminal().viewProps.onInput?.('€'));
    expect(Array.from(session.sent[0] ?? [])).toEqual([0xe2, 0x82, 0xac]);
  });
});
