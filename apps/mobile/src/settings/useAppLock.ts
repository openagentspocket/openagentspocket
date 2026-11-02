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
  /** Why the last unlock attempt did not unlock, when worth telling the owner. */
  message: string | null;
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
  const [message, setMessage] = useState<string | null>(null);
  const [, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    gate.current?.configure(appLockEnabled, appLockGrace);
    refresh();
  }, [appLockEnabled, appLockGrace, refresh]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      const g = gate.current;
      if (!g) return;
      // The app's own prompt makes the app go inactive and active; that is not leaving it.
      // A real trip to the background during the prompt is still honored.
      if (authenticator.isPrompting() && state !== 'background' && !g.away) return;
      if (state === 'active') {
        g.activate(now());
        // The device may have lost its passcode while the app was locked; never lock the owner out.
        if (g.locked) {
          authenticator.kind().then((kind) => {
            if (kind === null && gate.current?.locked) {
              gate.current.unlock();
              refresh();
            }
          });
        }
      } else if (state === 'background') g.deactivate(now());
      else g.cover();
      refresh();
    });
    return () => subscription.remove();
  }, [authenticator, now, refresh]);

  const unlock = useCallback(async () => {
    const kind = await authenticator.kind();
    // A device that lost its biometrics and passcode cannot prompt; never lock the owner out.
    const result =
      kind === null ? 'unavailable' : await authenticator.authenticate(t('Agentico Is Locked'));
    if (result === 'success' || result === 'unavailable') {
      setMessage(null);
      gate.current?.unlock();
    } else {
      setMessage(
        result === 'denied'
          ? t("%@ did not confirm it's you. Try again.", kind ?? t('Passcode'))
          : null,
      );
    }
    refresh();
  }, [authenticator, refresh]);

  const current = gate.current;
  return { covered: current.covered || current.locked, locked: current.locked, message, unlock };
}
