import {
  type AgentBanner,
  AgentBannerStore,
  type AgentBannerTarget,
  type BannerAgent,
  type BannerStoreOptions,
  type Clock,
} from '@openagentspocket/core';
import { systemClock } from '@openagentspocket/transport';
import { NoticeBanner, ProgramMark, useInsets, useTheme } from '@openagentspocket/ui';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { renderMessage } from './renderText';

const BannerContext = createContext<AgentBannerStore | null>(null);

/** Feeds the Console's live Agent list to the banner store; a no-op outside the provider. */
export function useBannerFeed(): (agents: readonly BannerAgent[]) => void {
  const store = useContext(BannerContext);
  return (agents) => store?.agentsDidChange(agents);
}

const DEMO_HOST = 'banner-demo';
const demoAgent = (status: string): BannerAgent => ({
  hostId: DEMO_HOST,
  paneId: 'demo',
  status,
  kind: 'claude',
  workspaceLabel: 'Demo',
});

/** Plays a working -> blocked transition for a demo Host (gallery trigger); no-op outside the provider. */
export function useBannerDemo(): () => void {
  const store = useContext(BannerContext);
  return () => {
    store?.agentsDidChange([demoAgent('working')]);
    store?.agentsDidChange([demoAgent('blocked')]);
  };
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
 * Mounted once in the app layout. Owns the banner store and draws its banner as a NoticeBanner
 * (kind inapp) pinned to the top of the whole app: slides and fades in, a blocked Agent's question
 * in three monospaced lines, tap opens the Agent, swipe up dismisses.
 */
export function InAppBanner(props: InAppBannerProps) {
  const { presentedAgent, triggers, openAgent, clock, screenReader, children } = props;
  const store = useMemo(
    () =>
      new AgentBannerStore(clock ?? systemClock, {
        presentedAgent: () => presentedAgent?.(),
        triggers: (host) => (host === DEMO_HOST ? { blocked: true, done: true } : triggers?.(host)),
        playSound: () => {},
        isScreenReaderOn: () => screenReader?.() ?? false,
        announce: (text) => AccessibilityInfo.announceForAccessibility(text),
        renderBody: renderMessage,
      }),
    [clock, presentedAgent, triggers, screenReader],
  );
  // The banner on screen, kept past the store clearing it so the exit can play.
  const [shown, setShown] = useState<{ banner: AgentBanner; leaving: boolean } | undefined>();
  useEffect(() => {
    const sync = () => {
      const next = store.banner;
      setShown((current) => {
        if (next) return { banner: next, leaving: false };
        return current ? { ...current, leaving: true } : undefined;
      });
    };
    sync();
    return store.subscribe(sync);
  }, [store]);
  const banner = shown?.banner;
  return (
    <BannerContext.Provider value={store}>
      {children}
      {banner ? (
        <BannerLayer
          key={bannerKey(banner)}
          banner={banner}
          visible={!shown?.leaving}
          onExited={() => setShown((c) => (c?.leaving ? undefined : c))}
          onPress={() => {
            store.dismiss();
            openAgent?.(banner.target);
          }}
          onDismiss={() => store.dismiss()}
        />
      ) : null}
    </BannerContext.Provider>
  );
}

interface BannerLayerProps {
  banner: AgentBanner;
  visible?: boolean;
  /** False jumps to the end state (the atlas pins its clock). */
  animated?: boolean;
  onExited?: () => void;
  onPress?: () => void;
  onDismiss?: () => void;
}

/** The banner pinned below the status bar (safe area top) and over the screen's header. */
export function BannerLayer({ banner, animated, ...rest }: BannerLayerProps) {
  const insets = useInsets();
  const theme = useTheme();
  return (
    <View
      style={[styles.layer, { paddingTop: insets.top + theme.spacing.xs }]}
      pointerEvents="box-none"
      testID="in-app-banner-layer"
    >
      <View style={{ width: '100%', paddingHorizontal: theme.spacing.md }}>
        <NoticeBanner
          kind="inapp"
          animated={animated}
          title={banner.title}
          message={renderMessage(banner.body)}
          question={banner.question}
          tone={banner.status === 'blocked' ? 'warning' : 'success'}
          leading={<ProgramMark program={bannerProgram(banner)} size={28} />}
          testID="in-app-banner"
          {...rest}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFill, alignItems: 'center' },
});

const bannerKey = (banner: AgentBanner) => `${banner.target.hostId}:${banner.target.paneId}`;

function bannerProgram(banner: AgentBanner): string {
  return banner.title.split(' · ').at(-1) ?? banner.title;
}
