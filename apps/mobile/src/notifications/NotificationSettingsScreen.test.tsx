import { setLocale, translate } from '@openagentspocket/i18n';
import { ThemeProvider } from '@openagentspocket/ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { NotificationPrivacyScreen } from './NotificationPrivacyScreen';
import { NotificationSettingsScreen } from './NotificationSettingsScreen';
import {
  createDemoNotificationServices,
  type NotificationServices,
  NotificationServicesProvider,
} from './services';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
}));

const renderWith = (ui: ReactElement, services: NotificationServices) =>
  render(
    <ThemeProvider themeId="indigo">
      <NotificationServicesProvider services={services}>{ui}</NotificationServicesProvider>
    </ThemeProvider>,
  );

async function enablePush() {
  await fireEvent.press(await screen.findByTestId('notifications-enable'));
  await fireEvent.press(await screen.findByTestId('notification-explainer-continue'));
  await screen.findByTestId('notifications-host-demo');
}

describe('NotificationSettingsScreen', () => {
  afterEach(() => {
    setLocale('en');
    mockPush.mockClear();
  });

  it('shows no Host rows until the explainer is accepted and a token lands', async () => {
    await renderWith(<NotificationSettingsScreen />, createDemoNotificationServices());
    await screen.findByTestId('notifications-enable');
    expect(screen.queryByTestId('notifications-host-demo')).toBeNull();
    await enablePush();
  });

  it('does not request permission when the explainer is dismissed', async () => {
    const services = createDemoNotificationServices();
    await renderWith(<NotificationSettingsScreen />, services);
    await fireEvent.press(await screen.findByTestId('notifications-enable'));
    await screen.findByTestId('notification-explainer-continue');
    await fireEvent.press(screen.getByText(translate('en', 'app', 'Not Now')));
    expect((await services.pushToken.state()).kind).toBe('needsPermission');
  });

  it('registers a Host only when the Host confirms, then offers the flags', async () => {
    const services = createDemoNotificationServices();
    await renderWith(<NotificationSettingsScreen />, services);
    await enablePush();
    await waitFor(() => expect(screen.getByTestId('notifications-host-demo-enabled')).toBeTruthy());
    expect(screen.queryByTestId('notifications-host-demo-done')).toBeNull();

    await act(async () => {
      fireEvent(screen.getByTestId('notifications-host-demo-enabled'), 'valueChange', true);
    });
    await waitFor(() => expect(screen.getByTestId('notifications-host-demo-done')).toBeTruthy());
    expect(services.store.confirmedTriggers('demo')).toEqual({
      blocked: true,
      done: true,
      approve: false,
    });

    await act(async () => {
      fireEvent(screen.getByTestId('notifications-host-demo-done'), 'valueChange', false);
    });
    await waitFor(() => expect(services.store.confirmedTriggers('demo')?.done).toBe(false));
  });

  it('flags an invalid relay entry and a plain HTTP one', async () => {
    const services = createDemoNotificationServices();
    await renderWith(<NotificationSettingsScreen />, services);
    const field = await screen.findByTestId('notifications-relay-field');
    await fireEvent.changeText(field, 'nonsense');
    expect(services.relay.hasInvalidEntry).toBe(true);
    expect(
      screen.getByText(translate('en', 'app', 'Enter a valid HTTP or HTTPS URL.')),
    ).toBeTruthy();
    await fireEvent.changeText(field, 'http://relay.example');
    expect(services.relay.hasInsecureHTTPEntry).toBe(true);
  });

  it('links to the privacy disclosure', async () => {
    await renderWith(<NotificationSettingsScreen />, createDemoNotificationServices());
    await fireEvent.press(await screen.findByTestId('notifications-privacy-link'));
    expect(mockPush).toHaveBeenCalledWith('/settings/notification-privacy');
  });

  it('titles the push section from the catalog of the current locale', async () => {
    setLocale('es');
    await renderWith(<NotificationSettingsScreen />, createDemoNotificationServices());
    const spanish = translate('es', 'app', 'Agent Notifications');
    expect(spanish).not.toBe(translate('en', 'app', 'Agent Notifications'));
    await waitFor(() => expect(screen.getByText(spanish)).toBeTruthy());
  });
});

describe('NotificationPrivacyScreen', () => {
  it('tells the relay story', async () => {
    await renderWith(<NotificationPrivacyScreen />, createDemoNotificationServices());
    expect(screen.getByTestId('notification-disclosure')).toBeTruthy();
    expect(screen.getByText(translate('en', 'app', 'What it cannot see'))).toBeTruthy();
  });

  it('drives the per-Host Live Activity opt-in once the Host is registered', async () => {
    const enabled = new Set<string>();
    const services: NotificationServices = {
      ...createDemoNotificationServices(),
      liveActivity: {
        activitiesEnabled: true,
        isEnabled: (hostId) => enabled.has(hostId),
        setEnabled: (on, hostId) => {
          if (on) enabled.add(hostId);
          else enabled.delete(hostId);
        },
      },
    };
    await renderWith(<NotificationSettingsScreen />, services);
    await enablePush();
    expect(screen.queryByTestId('notifications-host-demo-live-activity')).toBeNull();
    await act(async () => {
      fireEvent(screen.getByTestId('notifications-host-demo-enabled'), 'valueChange', true);
    });
    const toggle = await screen.findByTestId('notifications-host-demo-live-activity');
    await act(async () => {
      fireEvent(toggle, 'valueChange', true);
    });
    expect(enabled.has('demo')).toBe(true);
  });
});
