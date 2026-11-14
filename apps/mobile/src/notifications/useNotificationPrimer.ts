import {
  combinedDelivery,
  type HostDelivery,
  type PrimerPhase,
  type PushRegistrationState,
  primerStep,
  registerUnregisteredHosts,
  turnOnNotifications,
} from '@openagentspocket/core';
import { useOverlayShowing } from '@openagentspocket/ui';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useDemoMode } from '@/connections/useDemoMode';
import { useConsoleState } from '@/console/hooks';
import { useAppActive } from '@/lib/useAppActive';
import { useNotificationServices } from './services';

/** Home settles (a pairing sheet or route finishes leaving) before the primer presents. */
export const PRIMER_SETTLE_MS = 600;

const noSubscription = () => () => {};

export interface NotificationPrimerState {
  readonly sheetVisible: boolean;
  readonly bannerVisible: boolean;
  /** The sheet's primary action and the banner's: the permission request, then the Hosts. */
  turnOn(): void;
  /** Not Now, or the sheet swiped away: one reminder is left. */
  notNow(): void;
  /** The banner's close: no more reminders. */
  dismissBanner(): void;
}

/**
 * The once-per-install notification primer on Home: gathers the facts `primerStep` decides on
 * (a Host connected, Home idle in front, the permission, whether a Host can deliver, a blocked
 * Agent) and carries out its step. `focused`: Home is the screen in front.
 */
export function useNotificationPrimer(focused: boolean): NotificationPrimerState {
  const services = useNotificationServices();
  const { primer, pushToken, store } = services;
  const phase = useSyncExternalStore<PrimerPhase>(
    primer?.record.subscribe ?? noSubscription,
    () => primer?.record.phase ?? 'done',
  );
  const demo = useDemoMode();
  const { hosts, rows } = useConsoleState();
  const overlay = useOverlayShowing();
  const active = useAppActive();
  const [permission, setPermission] = useState<PushRegistrationState['kind']>('unknown');
  const [answers, setAnswers] = useState<ReadonlyMap<string, HostDelivery>>(new Map());
  const [sheetVisible, setSheetVisible] = useState(false);

  const liveIds = hosts.filter((host) => host.link === 'live').map((host) => host.id);
  const liveKey = liveIds.join('\n');
  const watching = primer !== undefined && !demo && phase !== 'done';
  const hostConnected = liveIds.length > 0;

  // Read again on every return to the foreground: the owner may have answered in iOS Settings.
  useEffect(() => {
    if (!watching || !active || (phase === 'pending' && !hostConnected)) return;
    let current = true;
    void pushToken.state().then((next) => current && setPermission(next.kind));
    return () => {
      current = false;
    };
  }, [watching, active, phase, hostConnected, pushToken]);

  const step = primerStep({
    phase,
    freshInstall: primer?.record.freshInstall ?? false,
    demo,
    hostConnected,
    homeIdle: focused && active && !overlay,
    permission,
    delivery: combinedDelivery(liveIds.map((id) => answers.get(id))),
    agentBlocked: rows.some((row) => row.agent.agent_status === 'blocked'),
  }).kind;

  useEffect(() => {
    if (!primer) return;
    if (step === 'finish') primer.record.set('done');
    if (step === 'remind') primer.record.set('reminding');
    if (step === 'register') {
      primer.record.set('done');
      void registerUnregisteredHosts(store);
    }
    if (step === 'probe') {
      const pending = liveKey.split('\n').filter((id) => id && !answers.has(id));
      // Marked first, so a Host is asked once per launch even while its answer is on the way.
      setAnswers((map) => new Map([...map, ...pending.map((id) => [id, 'unknown'] as const)]));
      for (const id of pending) {
        const host = store.hosts.find((candidate) => candidate.id === id);
        if (!host) continue;
        void primer
          .delivery(host)
          .then((answer) => setAnswers((map) => new Map(map).set(id, answer)));
      }
    }
    if (step !== 'showSheet') return;
    const timer = setTimeout(() => setSheetVisible(true), PRIMER_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [step, primer, store, liveKey, answers]);

  const turnOn = useCallback(() => {
    setSheetVisible(false);
    primer?.record.set('done');
    void turnOnNotifications(pushToken, store).then((next) => setPermission(next.kind));
  }, [primer, pushToken, store]);
  const notNow = useCallback(() => {
    setSheetVisible(false);
    primer?.record.set('declined');
  }, [primer]);
  const dismissBanner = useCallback(() => primer?.record.set('done'), [primer]);

  return useMemo(
    () => ({ sheetVisible, bannerVisible: step === 'showBanner', turnOn, notNow, dismissBanner }),
    [sheetVisible, step, turnOn, notNow, dismissBanner],
  );
}
