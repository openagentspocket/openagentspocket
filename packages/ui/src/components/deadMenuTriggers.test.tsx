import { fireEvent, screen } from '@testing-library/react-native';
import { ActionMenuButton, isDeadMenuTrigger } from '../overlay/ActionMenu';
import { renderThemed } from '../test-utils';
import { ComposerCard } from './agentBar';
import { Fab } from './homeShell';

const item = { key: 'one', title: 'One', onPress: jest.fn() };

describe('a button that opens a menu never ships dead', () => {
  it('knows a dead trigger: no items and no press handler', () => {
    expect(isDeadMenuTrigger(undefined)).toBe(true);
    expect(isDeadMenuTrigger([])).toBe(true);
    expect(isDeadMenuTrigger([item])).toBe(false);
    expect(isDeadMenuTrigger([], () => {})).toBe(false);
  });

  it('ComposerCard draws + and ... only with something to open', async () => {
    await renderThemed(
      <ComposerCard value="" onChange={jest.fn()} onSend={jest.fn()} moreMenu={[]} addMenu={[]} />,
    );
    expect(screen.queryByTestId('composer-card-add')).toBeNull();
    expect(screen.queryByTestId('composer-card-more')).toBeNull();
  });

  it('ComposerCard draws + for a menu and ... for a more menu', async () => {
    await renderThemed(
      <ComposerCard
        value=""
        onChange={jest.fn()}
        onSend={jest.fn()}
        addMenu={[item]}
        moreMenu={[item]}
        expanded
      />,
    );
    expect(screen.getByTestId('composer-card-add')).toBeTruthy();
    expect(screen.getByTestId('composer-card-more')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('composer-card-add'));
    expect(await screen.findByTestId('action-menu-one')).toBeTruthy();
  });

  it('ActionMenuButton draws nothing for an empty menu', async () => {
    await renderThemed(<ActionMenuButton items={[]} accessibilityLabel="More" native={false} />);
    expect(screen.queryByTestId('menu-button')).toBeNull();
    await renderThemed(
      <ActionMenuButton items={[item]} accessibilityLabel="More" native={false} />,
    );
    expect(screen.getByTestId('menu-button')).toBeTruthy();
  });

  it('Fab draws nothing for an empty menu without a press handler, and a button with one', async () => {
    await renderThemed(<Fab items={[]} accessibilityLabel="New" />);
    expect(screen.queryByTestId('fab')).toBeNull();
    await renderThemed(<Fab items={[]} accessibilityLabel="New" onPress={jest.fn()} />);
    expect(screen.getByTestId('fab')).toBeTruthy();
  });
});
