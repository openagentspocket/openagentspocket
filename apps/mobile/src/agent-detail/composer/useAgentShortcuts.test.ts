import { renderHook } from '@testing-library/react-native';
import type { Surface } from '../surface';
import type { AgentComposer } from './composerContext';
import { useAgentShortcuts } from './useAgentShortcuts';

jest.mock('../useAgentScreenIO', () => ({
  useAgentScreenIO: () => ({ sendKeys: jest.fn(async () => undefined) }),
}));
jest.mock('../useAgentMode', () => ({ refreshAgentMode: jest.fn() }));

async function menu(program: string, surface: Surface, showTerminal?: () => void) {
  const insertIntoDraft = jest.fn();
  const composer = {
    hostId: 'h',
    paneId: 'p',
    store: { insertIntoDraft },
  } as unknown as AgentComposer;
  const { result } = await renderHook(() =>
    useAgentShortcuts(composer, program, surface, showTerminal),
  );
  const tap = (command: string) => {
    const item = result.current.find((entry) => entry.subtitle === command);
    if (!item) throw new Error(`no ${command} in the menu`);
    item.onPress?.();
  };
  return { items: result.current, tap, insertIntoDraft };
}

describe('useAgentShortcuts', () => {
  it('keeps /compact in Chat', async () => {
    const showTerminal = jest.fn();
    const { tap, insertIntoDraft } = await menu('opencode', 'chat', showTerminal);
    tap('/compact');
    expect(showTerminal).not.toHaveBeenCalled();
    expect(insertIntoDraft).toHaveBeenCalledWith('/compact ');
  });

  it("takes a picker command to the terminal, typed in the program's form", async () => {
    const showTerminal = jest.fn();
    const { tap, insertIntoDraft } = await menu('opencode', 'chat', showTerminal);
    tap('/sessions');
    expect(showTerminal).toHaveBeenCalledTimes(1);
    expect(insertIntoDraft).toHaveBeenCalledWith('/sessions');
  });

  it('types a command on the terminal without moving', async () => {
    const { tap, insertIntoDraft } = await menu('claude', 'terminal');
    tap('/model');
    expect(insertIntoDraft).toHaveBeenCalledWith('/model ');
  });

  it("leaves a terminal command out of Chat's menu when there is no way to the terminal", async () => {
    const { items } = await menu('codex', 'chat');
    const subtitles = items.map((item) => item.subtitle);
    expect(subtitles).toContain('/compact');
    expect(subtitles).not.toContain('/model');
  });
});
