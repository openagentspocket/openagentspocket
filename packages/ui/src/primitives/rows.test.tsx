import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { ListRow, Section, Text } from '../index';
import { renderThemed } from '../test-utils';

const menuItems = (onRename: () => void) => [
  { key: 'rename', title: 'Rename', onPress: onRename },
  { key: 'close', title: 'Close', destructive: true, onPress: jest.fn() },
];

describe('ListRow', () => {
  it('speaks title, subtitle and value as one button and fires onPress', async () => {
    const onPress = jest.fn();
    await renderThemed(
      <ListRow title="Theme" subtitle="Appearance" value="Índigo" chevron onPress={onPress} />,
    );
    const row = screen.getByRole('button', { name: 'Theme, Appearance, Índigo' });
    await fireEvent.press(row);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is not a button without an action', async () => {
    await renderThemed(<ListRow title="Static" />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Static')).toBeTruthy();
  });

  it('opens its menu on long press and runs the item after the menu closes', async () => {
    const onRename = jest.fn();
    await renderThemed(<ListRow title="Agent" onPress={() => {}} menu={menuItems(onRename)} />);
    await fireEvent(screen.getByRole('button', { name: 'Agent' }), 'longPress');
    await fireEvent.press(await screen.findByRole('menuitem', { name: 'Rename' }));
    expect(screen.queryByRole('menuitem', { name: 'Rename' })).toBeNull();
    await waitFor(() => expect(onRename).toHaveBeenCalledTimes(1));
  });

  it('exposes swipe and menu actions as accessibility actions', async () => {
    const onPin = jest.fn();
    const onRename = jest.fn();
    await renderThemed(
      <ListRow
        title="Agent"
        onPress={() => {}}
        menu={menuItems(onRename)}
        swipeActions={[{ key: 'pin', title: 'Pin', onPress: onPin }]}
      />,
    );
    const row = screen.getByRole('button', { name: 'Agent' });
    expect(row.props.accessibilityActions.map((action: { name: string }) => action.name)).toEqual([
      'pin',
      'rename',
      'close',
    ]);
    await fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'pin' } });
    await fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'rename' } });
    expect(onPin).toHaveBeenCalledTimes(1);
    expect(onRename).toHaveBeenCalledTimes(1);
  });

  it('hides swipe actions from screen readers while closed and runs one when tapped', async () => {
    const onPin = jest.fn();
    await renderThemed(
      <ListRow title="Agent" swipeActions={[{ key: 'pin', title: 'Pin', onPress: onPin }]} />,
    );
    expect(screen.queryByRole('button', { name: 'Pin' })).toBeNull();
    await fireEvent.press(screen.getByTestId('swipe-action-pin', { includeHiddenElements: true }));
    expect(onPin).toHaveBeenCalled();
  });

  it('does not fire when disabled', async () => {
    const onPress = jest.fn();
    await renderThemed(<ListRow title="Off" onPress={onPress} disabled />);
    await fireEvent.press(screen.getByRole('button', { name: 'Off' }));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('Section', () => {
  it('groups rows in one card with hairlines between them and a footer', async () => {
    await renderThemed(
      <Section title="Hosts" count={3} footer="Pair a Host to add it.">
        <ListRow title="A" />
        <ListRow title="B" />
        <ListRow title="C" />
      </Section>,
    );
    expect(screen.getByRole('header')).toBeTruthy();
    expect(screen.getAllByTestId('row-separator', { includeHiddenElements: true })).toHaveLength(2);
    expect(screen.getByText('Pair a Host to add it.')).toBeTruthy();
  });

  it('lays children out loose when not grouped', async () => {
    await renderThemed(
      <Section title="Cards" grouped={false}>
        <Text>one</Text>
        <Text>two</Text>
      </Section>,
    );
    expect(screen.queryAllByTestId('row-separator', { includeHiddenElements: true })).toHaveLength(
      0,
    );
  });

  it('hides its rows while collapsed and toggles from the header', async () => {
    const onToggle = jest.fn();
    await renderThemed(
      <Section title="Done" expanded={false} onToggle={onToggle} footer="footer">
        <ListRow title="Hidden row" />
      </Section>,
    );
    expect(screen.queryByText('Hidden row')).toBeNull();
    expect(screen.queryByText('footer')).toBeNull();
    await fireEvent.press(screen.getByRole('header'));
    expect(onToggle).toHaveBeenCalled();
  });
});
