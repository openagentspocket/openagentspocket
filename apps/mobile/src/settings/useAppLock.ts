import { AppLockGate } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useAuthenticator, useSettings } from './SettingsProvider';

export interface AppLockView {
  /** Hide the app's content (switcher snapshot, or waiting for the owner). */
  covered: boolean;
  /** Ask the owner to unlock. */
  locked: boolean;
  unlock: () => Promise<void>;
}

/**
 * Drives the app lock from the settings and the OS app state: locked at launch, covered while
 * not active, locked again after the grace period. `now` is injectable for tests.
 */
export function useAppLock(now: () => number = Date.now): AppLockView {
  const { appLockEnabled, appLockGrace } = useSettings();
  const authenticator = useAuthenticator();
  const gate = useRef<AppLockGate | null>(null);
  gate.current ??= new AppLockGate(appLockEnabled, appLockGrace);
  const [, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    gate.current?.configure(appLockEnabled, appLockGrace);
    refresh();
  }, [appLockEnabled, appLockGrace, refresh]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') gate.current?.activate(now());
      else gate.current?.deactivate(now());
      refresh();
    });
    return () => subscription.remove();
  }, [now, refresh]);

  const unlock = useCallback(async () => {
    const kind = await authenticator.kind();
    // A device that lost its biometrics and passcode cannot prompt; never lock the owner out.
    if (kind === null || (await authenticator.authenticate(t('Agentico Is Locked')))) {
      gate.current?.unlock();
      refresh();
    }
  }, [authenticator, refresh]);

  const current = gate.current;
  return { covered: current.covered || current.locked, locked: current.locked, unlock };
}
