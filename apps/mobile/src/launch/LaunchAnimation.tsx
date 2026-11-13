import { LaunchOverlay, useReducedMotionSetting } from '@openagentspocket/ui';
import { usePathname, useRootNavigationState } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';

/** Played once per process: a cold start. A remount of the root (Try Again) does not replay it. */
let played = false;

/** Test hook: lets each test start from a fresh process. */
export function resetLaunchAnimation(): void {
  played = false;
}

/** The development harnesses (`__atlas`, `__gallery`, ...) are captured as they open: no launch over them. */
export const isHarnessPath = (pathname: string): boolean => pathname.startsWith('/__');

/**
 * The launch over the whole app, mounted last at the root so it draws above every screen, the
 * banner, the app lock cover and the overlay host. The app mounts and routes underneath (a link or
 * a notification tap that launched the app lands on its screen); the sweep waits for the root
 * navigator to be ready. The overlay never takes touches, and is removed from the tree when done.
 */
export function LaunchAnimation() {
  const [showing, setShowing] = useState(() => !played);
  const ready = useRootNavigationState()?.key !== undefined;
  const harness = isHarnessPath(usePathname());
  const reduceMotion = useReducedMotionSetting();
  const finish = useCallback(() => {
    played = true;
    setShowing(false);
  }, []);
  useEffect(() => {
    if (showing && harness) finish();
  }, [showing, harness, finish]);

  if (!showing || harness) return null;
  return (
    <>
      {/* Light ink over the black launch; the themed bar takes over again once it unmounts. */}
      <StatusBar style="light" />
      <LaunchOverlay ready={ready} reduceMotion={reduceMotion} onDone={finish} />
    </>
  );
}
