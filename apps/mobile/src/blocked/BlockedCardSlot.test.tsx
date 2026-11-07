import { ThemeProvider } from '@openagentspocket/ui';
import { render } from '@testing-library/react-native';
import { Keyboard } from 'react-native';
import { BlockedCardOverride, BlockedCardSlot } from './BlockedCardSlot';
import type { BlockedCardHandle } from './useBlockedCard';

const handle = (kind: string, dialogGeneration = 1) =>
  ({
    state: {
      content: { kind, keys: [] },
      dialogGeneration,
      isCollapsed: true,
      progress: 'ready',
      notice: null,
    },
    store: {},
  }) as unknown as BlockedCardHandle;

const show = (card: BlockedCardHandle) => (
  <ThemeProvider themeId="indigo">
    <BlockedCardOverride.Provider value={card}>
      <BlockedCardSlot />
    </BlockedCardOverride.Provider>
  </ThemeProvider>
);

describe('the Blocked card and the keyboard', () => {
  const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
  afterEach(() => dismiss.mockClear());

  it('closes the keyboard when a card asks, once per dialog', async () => {
    const view = await render(show(handle('generic')));
    expect(dismiss).toHaveBeenCalledTimes(1);
    await view.rerender(show(handle('generic')));
    expect(dismiss).toHaveBeenCalledTimes(1);
    await view.rerender(show(handle('generic', 2)));
    expect(dismiss).toHaveBeenCalledTimes(2);
  });

  it('leaves the keyboard alone with nothing to answer', async () => {
    await render(show(handle('none')));
    expect(dismiss).not.toHaveBeenCalled();
  });
});
