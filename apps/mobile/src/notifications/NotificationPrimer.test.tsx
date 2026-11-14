import {
  apnsToken,
  type DevicePushTokenSource,
  type HostDelivery,
  MemoryStorage,
  NotificationPrimerRecord,
  PRIMER_SETTING_KEY,
  type PushRegistrationState,
} from '@openagentspocket/core';
import { ThemeProvider } from '@openagentspocket/ui';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { setDemoMode } from '@/connections/mode';
import { NotificationPrimer } from './NotificationPrimer';
import { createDemoNotificationServices, NotificationServicesProvider } from './services';

const WAIT = { timeout: 4000 };

async function setup(
  options: { permission?: PushRegistrationState; delivery?: HostDelivery } = {},
) {
  let current: PushRegistrationState = options.permission ?? { kind: 'needsPermission' };
  const source = {
    state: jest.fn(async () => current),
    enable: jest.fn(async () => {
      current = { kind: 'registered', token: apnsToken('demo-token', 'sandbox') };
      return current;
    }),
  } satisfies DevicePushTokenSource;
  const storage = new MemoryStorage();
  const record = new NotificationPrimerRecord(storage, () => false);
  const delivery = jest.fn(async () => options.delivery ?? 'yes');
  const services = {
    ...createDemoNotificationServices(undefined, source),
    primer: { record, delivery },
  };
  await render(
    <ThemeProvider themeId="indigo">
      <NotificationServicesProvider services={services}>
        <NotificationPrimer focused />
      </NotificationServicesProvider>
    </ThemeProvider>,
  );
  return { source, record, storage, delivery };
}

describe('NotificationPrimer', () => {
  // jest-expo mocks AppState: the app is in the foreground for these tests.
  beforeAll(() => Object.defineProperty(AppState, 'currentState', { value: 'active' }));
  afterEach(() => setDemoMode(undefined));

  it('opens once a Host is connected, and Turn On asks for the permission once', async () => {
    const { source, record, delivery } = await setup();
    await fireEvent.press(await screen.findByTestId('notification-primer-primary', {}, WAIT));
    expect(delivery).toHaveBeenCalled();
    await waitFor(() => expect(source.enable).toHaveBeenCalledTimes(1));
    expect(record.phase).toBe('done');
  });

  it('Not Now is stored, then the first blocked Agent brings one reminder that ends for good', async () => {
    const { source, record, storage } = await setup();
    await fireEvent.press(await screen.findByTestId('notification-primer-secondary', {}, WAIT));
    expect(record.phase).not.toBe('pending');
    expect(storage.getString(PRIMER_SETTING_KEY)).toContain('"phase"');
    expect(source.enable).not.toHaveBeenCalled();
    // The demo console has a blocked Agent: the reminder shows instead of the sheet.
    await fireEvent.press(await screen.findByTestId('notification-reminder-dismiss', {}, WAIT));
    expect(record.phase).toBe('done');
    expect(screen.queryByTestId('notification-reminder')).toBeNull();
  });

  it('never shows in demo mode', async () => {
    setDemoMode(true);
    const { record, source } = await setup();
    await new Promise<void>((resolve) => setTimeout(resolve, 1200));
    expect(screen.queryByTestId('notification-primer-primary')).toBeNull();
    expect(source.state).not.toHaveBeenCalled();
    expect(record.phase).toBe('pending');
  });

  it('a denied permission ends it without the sheet', async () => {
    const { record } = await setup({ permission: { kind: 'denied' } });
    await waitFor(() => expect(record.phase).toBe('done'), WAIT);
    expect(screen.queryByTestId('notification-primer-primary')).toBeNull();
  });

  it('waits while no connected Host can deliver', async () => {
    const { record, delivery } = await setup({ delivery: 'no' });
    await waitFor(() => expect(delivery).toHaveBeenCalled(), WAIT);
    await new Promise<void>((resolve) => setTimeout(resolve, 1000));
    expect(screen.queryByTestId('notification-primer-primary')).toBeNull();
    expect(record.phase).toBe('pending');
  });
});
