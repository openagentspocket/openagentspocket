import {
  type ChatCache,
  MemoryStorage,
  SETTINGS_DEFAULTS,
  SettingsStore,
  THEME_APPEARANCE,
} from '@openagentspocket/core';
import { OverlayHost, ThemeProvider, themeIds, themes } from '@openagentspocket/ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { type Authenticator, fakeAuthenticator } from './authenticator';
import { SettingsProvider } from './SettingsProvider';
import { SettingsScreen } from './SettingsScreen';
import { SETTINGS_PAGES, type SettingsRow } from './schema';

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  Stack: { Screen: () => null },
}));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));

interface Options {
  authenticator?: Authenticator;
  chatCache?: ChatCache;
}

async function setup(
  page: string,
  { authenticator = fakeAuthenticator(null), chatCache }: Options = {},
) {
  const store = new SettingsStore(new MemoryStorage());
  const ui: ReactElement = (
    <ThemeProvider themeId="indigo">
      <SettingsProvider store={store} authenticator={authenticator} chatCache={chatCache}>
        <SettingsScreen page={page} />
        <OverlayHost />
      </SettingsProvider>
    </ThemeProvider>
  );
  await render(ui);
  return store;
}

const allRows = () =>
  Object.values(SETTINGS_PAGES).flatMap((page) => page.sections.flatMap((s) => s.rows));

describe('settings schema', () => {
  it('has unique row ids and page links that resolve', () => {
    const rows = allRows();
    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
    for (const row of rows) {
      if (row.kind === 'page') expect(SETTINGS_PAGES[row.page]).toBeDefined();
    }
  });

  it('ties every toggle, picker and stepper to a known setting of the right kind', () => {
    const keyed = allRows().filter(
      (row): row is Extract<SettingsRow, { key: keyof typeof SETTINGS_DEFAULTS }> => 'key' in row,
    );
    expect(keyed.length).toBeGreaterThan(8);
    for (const row of keyed) {
      expect(row.key in SETTINGS_DEFAULTS).toBe(true);
      if (row.kind === 'picker') {
        const values = row.options.map((option) => option.value);
        expect(values).toContain(SETTINGS_DEFAULTS[row.key]);
      }
    }
  });

  it('keeps the core theme list in step with the design tokens', () => {
    expect([...themeIds].sort()).toEqual(Object.keys(THEME_APPEARANCE).sort());
    for (const id of themeIds) expect(themes[id].appearance).toBe(THEME_APPEARANCE[id]);
  });
});

describe('SettingsScreen', () => {
  it('shows the root sections, and no lock rows on a device that cannot authenticate', async () => {
    await setup('root');
    expect(screen.getByTestId('settings.appearance.theme')).toBeTruthy();
    expect(screen.getByTestId('settings.about.version')).toBeTruthy();
    // Routes whose screens exist show; the ones that do not stay hidden.
    expect(screen.getByTestId('settings.hosts')).toBeTruthy();
    expect(screen.queryByTestId('settings.snippets')).toBeNull();
    expect(screen.queryByTestId('settings-section-security')).toBeNull();
  });

  it('opens the root as a sheet (Done capsule, large title) and pushed pages without them', async () => {
    await setup('root');
    expect(screen.getByTestId('settings-done')).toBeTruthy();
    expect(screen.getByTestId('settings-header')).toBeTruthy();
  });

  it('keeps pushed pages free of the sheet header', async () => {
    await setup('toolbar');
    expect(screen.queryByTestId('settings-done')).toBeNull();
    expect(screen.getByTestId('settings.toolbar.preview', { hidden: true })).toBeTruthy();
  });

  it('shows the security rows when the device can authenticate, grace only with the lock on', async () => {
    const store = await setup('root', { authenticator: fakeAuthenticator('Face ID') });
    expect(await screen.findByTestId('settings.security.requireToOpen')).toBeTruthy();
    expect(screen.queryByTestId('settings.security.gracePeriod')).toBeNull();
    await act(async () => store.set('appLockEnabled', true));
    expect(screen.getByTestId('settings.security.gracePeriod')).toBeTruthy();
  });

  it('turns the lock on only after the owner authenticates', async () => {
    const denied = await setup('root', { authenticator: fakeAuthenticator('Face ID', false) });
    const toggle = await screen.findByTestId('settings.security.requireToOpen');
    await fireEvent(toggle, 'valueChange', true);
    expect(denied.get('appLockEnabled')).toBe(false);
  });

  it('turns the lock on when authentication succeeds', async () => {
    const store = await setup('root', { authenticator: fakeAuthenticator('Face ID', true) });
    const toggle = await screen.findByTestId('settings.security.requireToOpen');
    await fireEvent(toggle, 'valueChange', true);
    await waitFor(() => expect(store.get('appLockEnabled')).toBe(true));
  });

  it('switches the theme, and fills the slot of its appearance with Follow System', async () => {
    const store = await setup('theme');
    await fireEvent.press(screen.getByTestId('settings.theme.papel'));
    expect(store.get('theme')).toBe('papel');

    await fireEvent(screen.getByTestId('settings.theme.followSystem'), 'valueChange', true);
    await fireEvent.press(screen.getByTestId('settings.theme.noche'));
    expect(store.get('darkTheme')).toBe('noche');
    expect(store.get('theme')).toBe('papel');
  });

  it('changes sizes and fonts within their ranges', async () => {
    const store = await setup('fonts');
    await fireEvent.press(screen.getByTestId('settings.terminal.textSize-increment'));
    expect(store.get('terminalFontSize')).toBe(SETTINGS_DEFAULTS.terminalFontSize + 1);
    for (let i = 0; i < 6; i++) {
      await fireEvent.press(screen.getByTestId('settings.chat.textSize-increment'));
    }
    expect(store.get('chatTextOffset')).toBe(3);
    expect(screen.getByTestId('settings.chat.textSample')).toBeTruthy();
  });

  it('resets the toolbar after a confirmation', async () => {
    const store = await setup('toolbar');
    await fireEvent(screen.getByTestId('settings.toolbar.tab'), 'valueChange', false);
    expect(store.get('toolbarTab')).toBe(false);
    await fireEvent.press(screen.getByTestId('settings.toolbar.reset'));
    await fireEvent.press(await screen.findByTestId('alert-action-confirm'));
    await waitFor(() => expect(store.get('toolbarTab')).toBe(true));
  });

  it('clears the chat cache only after confirming, and only when there is something to clear', async () => {
    let bytes = 4200;
    const removeAll = jest.fn(async () => {
      bytes = 0;
    });
    await setup('chat', { chatCache: { diskUsage: async () => bytes, removeAll } });
    const clear = screen.getByTestId('settings.chat.clearCache');
    await waitFor(() => expect(clear.props.accessibilityState?.disabled).toBeFalsy());

    await fireEvent.press(clear);
    await fireEvent.press(await screen.findByTestId('alert-cancel'));
    expect(removeAll).not.toHaveBeenCalled();

    await fireEvent.press(clear);
    await fireEvent.press(await screen.findByTestId('alert-action-confirm'));
    await waitFor(() => expect(removeAll).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        screen.getByTestId('settings.chat.clearCache').props.accessibilityState?.disabled,
      ).toBe(true),
    );
  });

  it('lists the bundled notices on the acknowledgements page', async () => {
    await setup('acknowledgements');
    expect(screen.getByTestId('settings.notice.Lucide')).toBeTruthy();
  });
});
