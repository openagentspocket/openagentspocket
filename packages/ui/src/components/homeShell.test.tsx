import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Platform, Text } from 'react-native';
import { renderThemed } from '../test-utils';
import {
  Fab,
  HomeHostCard,
  InboxCard,
  LargeTitleBar,
  PaneSnapshot,
  SessionsStrip,
  UsageRing,
} from './homeShell';

const presentation = {
  program: 'claude',
  title: 'Checkout review',
  subtitle: 'Run the test?',
  age: '4m',
  chips: ['Build Server', 'storefront'],
  section: 'needsYou' as const,
};

describe('InboxCard', () => {
  it('is one button: tap and long press fire, chips and age render', async () => {
    const onPress = jest.fn();
    const onLongPress = jest.fn();
    await renderThemed(
      <InboxCard presentation={presentation} onPress={onPress} onLongPress={onLongPress} />,
    );
    const card = screen.getByRole('button');
    await fireEvent.press(card);
    await fireEvent(card, 'longPress');
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(screen.getByText('storefront')).toBeTruthy();
    expect(screen.getByTestId('inbox-card-age')).toBeTruthy();
    expect(card.props.accessibilityLabel).toContain('Checkout review');
  });

  it('marks the card selected only when selected', async () => {
    await renderThemed(<InboxCard presentation={presentation} selected onPress={() => {}} />);
    expect(screen.getByRole('button')).toBeSelected();
  });

  it('working cards drop the ring and show no selection', async () => {
    await renderThemed(
      <InboxCard presentation={{ ...presentation, section: 'working' }} onPress={() => {}} />,
    );
    expect(screen.getByRole('button')).not.toBeSelected();
  });
});

describe('SessionsStrip', () => {
  const sessions = [
    { id: 'a', kind: 'agent' as const, name: 'claude', title: 'Setup', host: 'Mac' },
    { id: 'b', kind: 'shell' as const, name: 'landing $', title: 'landing', host: 'Mac' },
  ];
  it('opens a session and See all', async () => {
    const onOpen = jest.fn();
    const onSeeAll = jest.fn();
    await renderThemed(
      <SessionsStrip
        sessions={sessions}
        title="Sessions"
        seeAllLabel="See all"
        onOpen={onOpen}
        onSeeAll={onSeeAll}
      />,
    );
    await fireEvent.press(screen.getByTestId('session-b'));
    expect(onOpen).toHaveBeenCalledWith('b');
    await fireEvent.press(screen.getByRole('button', { name: 'See all Sessions' }));
    expect(onSeeAll).toHaveBeenCalledTimes(1);
  });
});

describe('HomeHostCard', () => {
  it('speaks name, address and readiness and opens on tap', async () => {
    const onPress = jest.fn();
    await renderThemed(
      <HomeHostCard
        host={{
          name: 'Quiet Mac',
          address: 'dev@host:22',
          readiness: 'No Agents',
          tone: 'success',
        }}
        onPress={onPress}
      />,
    );
    const card = screen.getByRole('button');
    expect(card.props.accessibilityLabel).toContain('Quiet Mac');
    expect(card.props.accessibilityLabel).toContain('No Agents');
    expect(screen.getByTestId('home-host-card-dot-success')).toBeTruthy();
    await fireEvent.press(card);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('UsageRing', () => {
  it('draws the rounded percentage and presses', async () => {
    const onPress = jest.fn();
    await renderThemed(<UsageRing percent={47.6} onPress={onPress} accessibilityLabel="Usage" />);
    expect(screen.getByTestId('usage-ring-value')).toHaveTextContent('48');
    await fireEvent.press(screen.getByRole('button', { name: 'Usage' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('shows a glyph, not a number, without limits', async () => {
    await renderThemed(<UsageRing percent={null} accessibilityLabel="Usage" />);
    expect(screen.queryByTestId('usage-ring-value')).toBeNull();
    expect(screen.getByTestId('icon-usage', { includeHiddenElements: true })).toBeTruthy();
  });
});

describe('Fab', () => {
  // On iOS a choice runs once the sheet has left (the Modal's onDismiss, which Jest never fires).
  const asOS = (os: 'ios' | 'android') =>
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
  beforeEach(() => asOS('android'));
  afterEach(() => asOS('ios'));

  it('opens the New menu and runs an item', async () => {
    const onAgent = jest.fn();
    await renderThemed(
      <Fab
        accessibilityLabel="New"
        items={[{ key: 'agent', title: 'New Agent', onPress: onAgent }]}
      />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'New' }));
    await fireEvent.press(await screen.findByTestId('fab-sheet-agent'));
    await waitFor(() => expect(onAgent).toHaveBeenCalledTimes(1));
  });

  it('renders nothing while hidden', async () => {
    await renderThemed(<Fab accessibilityLabel="New" items={[]} hidden />);
    expect(screen.queryByTestId('fab')).toBeNull();
  });
});

describe('LargeTitleBar', () => {
  it('has a header title and labelled action buttons', async () => {
    const onSettings = jest.fn();
    await renderThemed(
      <LargeTitleBar
        title="Agentico"
        actions={[{ icon: 'settings', label: 'Settings', onPress: onSettings }]}
      />,
    );
    expect(screen.getByRole('header', { name: 'Agentico' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Settings' }));
    expect(onSettings).toHaveBeenCalledTimes(1);
  });
});

describe('Home header and snapshots', () => {
  it('LargeTitleBar draws a leading capsule and no title when none is given', async () => {
    const onPress = jest.fn();
    await renderThemed(
      <LargeTitleBar
        leadingActions={[{ icon: 'list', label: 'All Agents', onPress }]}
        actions={[{ icon: 'settings', label: 'Settings', onPress: jest.fn() }]}
      />,
    );
    await fireEvent.press(screen.getByLabelText('All Agents'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('header')).toBeNull();
  });

  it('LargeTitleBar draws a custom leading control and no title', async () => {
    await renderThemed(
      <LargeTitleBar
        leading={<Text>Menu</Text>}
        actions={[{ icon: 'settings', label: 'Settings', onPress: jest.fn() }]}
      />,
    );
    expect(screen.getByText('Menu')).toBeTruthy();
    expect(screen.queryByRole('header')).toBeNull();
  });

  it('SessionsStrip shows a preview in the tile and no See all without one', async () => {
    await renderThemed(
      <SessionsStrip
        sessions={[{ id: 'a', kind: 'agent', name: 'claude', title: 'T', host: 'H' }]}
        title="Sessions"
        onOpen={jest.fn()}
        renderPreview={() => <PaneSnapshot lines={['$ ls', 'done']} />}
      />,
    );
    expect(screen.getByText('done', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByText('See all')).toBeNull();
  });
});
