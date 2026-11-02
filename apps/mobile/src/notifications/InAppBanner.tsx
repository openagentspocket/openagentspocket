import {
  type AgentBanner,
  AgentBannerStore,
  type AgentBannerTarget,
  type BannerAgent,
  type BannerStoreOptions,
  type Clock,
} from '@openagentspocket/core';
import { ProgramMark, toast } from '@openagentspocket/ui';
import { createContext, type ReactNode, useContext, useEffect, useMemo } from 'react';
import { AccessibilityInfo } from 'react-native';
import { renderMessage } from './renderText';

const systemClock: Clock = {
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  monotonicMs: () => Date.now(),
};

const BannerContext = createContext<AgentBannerStore | null>(null);

/** Feeds the Console's live Agent list to the banner store; a no-op outside the provider. */
export function useBannerFeed(): (agents: readonly BannerAgent[]) => void {
  const store = useContext(BannerContext);
  return (agents) => store?.agentsDidChange(agents);
}

interface InAppBannerProps {
  /** The Agent on screen, read when a held transition fires. */
  presentedAgent?: () => AgentBannerTarget | undefined;
  /** A Host's confirmed notify flags; unknown (the default) fails closed. */
  triggers?: BannerStoreOptions['triggers'];
  /** Opens the Agent a tapped banner points at. */
  openAgent?: (target: AgentBannerTarget) => void;
  /** Test seam. */
  clock?: Clock;
  screenReader?: () => boolean;
  children?: ReactNode;
}

/**
 * Mounted once in the app layout. Owns the banner store and shows its banner through the shared
 * toast host (top overlay, swipe up to dismiss, tap opens the Agent).
 */
export function InAppBanner(props: InAppBannerProps) {
  const { presentedAgent, triggers, openAgent, clock, screenReader, children } = props;
  const store = useMemo(
    () =>
      new AgentBannerStore(clock ?? systemClock, {
        presentedAgent: () => presentedAgent?.(),
        triggers: (host) => triggers?.(host),
        playSound: () => {},
        isScreenReaderOn: () => screenReader?.() ?? false,
        announce: (text) => AccessibilityInfo.announceForAccessibility(text),
        renderBody: renderMessage,
      }),
    [clock, presentedAgent, triggers, screenReader],
  );
  useEffect(() => {
    let dismissToast: (() => void) | undefined;
    let shown: AgentBanner | undefined;
    const sync = () => {
      const next = store.banner;
      if (next === shown) return;
      shown = next;
      dismissToast?.();
      dismissToast = undefined;
      if (!next) return;
      dismissToast = toast({
        title: next.title,
        message: next.question ?? renderMessage(next.body),
        tone: next.status === 'blocked' ? 'warning' : 'success',
        leading: <ProgramMark program={bannerProgram(next)} size={28} />,
        durationMs: 0,
        onPress: () => {
          store.dismiss();
          openAgent?.(next.target);
        },
      });
    };
    const off = store.subscribe(sync);
    return () => {
      off();
      dismissToast?.();
    };
  }, [store, openAgent]);
  return <BannerContext.Provider value={store}>{children}</BannerContext.Provider>;
}

function bannerProgram(banner: AgentBanner): string {
  return banner.title.split(' · ').at(-1) ?? banner.title;
}
