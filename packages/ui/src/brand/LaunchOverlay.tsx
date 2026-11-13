import { useEffect, useReducer, useRef, useState } from 'react';
import { Animated, Easing, type LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { AppMark } from './AppMark';
import { introMotion } from './introMotion';
import {
  bandSlices,
  initialLaunchGate,
  LAUNCH,
  launchGate,
  launchLayout,
  SWEEP_BEZIER,
} from './launchTimeline';
import { markPalette } from './mark.generated';
import { BandShape } from './markPieces';

interface LaunchOverlayProps {
  /** The app underneath can be shown; until then the assembled mark holds. */
  ready: boolean;
  /** The system's Reduce Motion setting, null while unknown (the screen stays black meanwhile). */
  reduceMotion: boolean | null;
  /** The app is fully revealed: the caller removes the overlay. */
  onDone: () => void;
  testID?: string;
}

const SLICES = bandSlices();

/**
 * The launch drawn over the whole app: black, the mark assembles itself, then a band in the
 * mark's spectrum sweeps from top to bottom and the app shows above it. Under Reduce Motion: the
 * still mark, then a short fade. Never takes touches, never reaches accessibility, and renders
 * nothing once done. Everything moves on the native driver (transforms and opacities only).
 */
export function LaunchOverlay({
  ready,
  reduceMotion,
  onDone,
  testID = 'launch-overlay',
}: LaunchOverlayProps) {
  const [gate, dispatch] = useReducer(launchGate, ready, initialLaunchGate);
  const [frame, setFrame] = useState<{ width: number; height: number } | null>(null);
  const clock = useRef(new Animated.Value(0)).current;
  const sweep = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const started = frame !== null && reduceMotion !== null;

  useEffect(() => {
    if (ready) dispatch('ready');
  }, [ready]);

  useEffect(() => {
    if (!started) return;
    if (reduceMotion) {
      const timer = setTimeout(() => dispatch('introDone'), LAUNCH.reduce.holdMs);
      return () => clearTimeout(timer);
    }
    const intro = Animated.timing(clock, {
      toValue: LAUNCH.introMs,
      duration: LAUNCH.introMs,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    intro.start(({ finished }) => finished && dispatch('introDone'));
    return () => intro.stop();
  }, [started, reduceMotion, clock]);

  useEffect(() => {
    if (gate.step === 'holding') {
      const timer = setTimeout(() => dispatch('waitedTooLong'), LAUNCH.maxWaitMs);
      return () => clearTimeout(timer);
    }
    if (gate.step === 'sweep') {
      const exit = reduceMotion
        ? Animated.timing(fade, {
            toValue: 0,
            duration: LAUNCH.reduce.fadeMs,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          })
        : Animated.timing(sweep, {
            toValue: 1,
            duration: LAUNCH.sweepMs,
            easing: Easing.bezier(...SWEEP_BEZIER),
            useNativeDriver: true,
          });
      exit.start(({ finished }) => finished && dispatch('sweepDone'));
      return () => exit.stop();
    }
    if (gate.step === 'done') onDone();
  }, [gate.step, reduceMotion, fade, sweep, onDone]);

  if (gate.step === 'done') return null;
  const measure = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (!frame || frame.width !== width || frame.height !== height) setFrame({ width, height });
  };
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={measure}
      style={StyleSheet.absoluteFill}
      testID={testID}
    >
      {!started ? (
        <View style={[StyleSheet.absoluteFill, styles.black]} />
      ) : reduceMotion ? (
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.black, styles.center, { opacity: fade }]}
        >
          <AppMark size={launchLayout(frame.width, frame.height).mark} />
        </Animated.View>
      ) : (
        <Sweep frame={frame} clock={clock} sweep={sweep} />
      )}
    </View>
  );
}

/**
 * The black screen and the mark, clipped from the top by a window whose top edge travels down with
 * the band: the outer view moves down while the inner one moves up by as much, so the mark stays put.
 */
function Sweep({
  frame,
  clock,
  sweep,
}: {
  frame: { width: number; height: number };
  clock: Animated.Value;
  sweep: Animated.Value;
}) {
  const { width, height } = frame;
  const { mark, band } = launchLayout(width, height);
  const [motion] = useState(() => introMotion(clock, mark));
  const travel = (from: number, to: number) =>
    sweep.interpolate({ inputRange: [0, 1], outputRange: [from, to] });
  // The window's top edge goes from half a band above the screen to half a band below it.
  const down = travel(band / 2, height + (band * 3) / 2);
  const up = travel(-band / 2, -(height + (band * 3) / 2));
  return (
    <>
      <Animated.View
        style={[
          styles.window,
          { top: -band, height: height + band * 2, transform: [{ translateY: down }] },
        ]}
        testID="launch-curtain"
      >
        <Animated.View
          style={[
            styles.black,
            styles.center,
            styles.pinned,
            { top: band, width, height, transform: [{ translateY: up }] },
          ]}
        >
          <AppMark size={mark} motion={motion} />
        </Animated.View>
      </Animated.View>
      <Animated.View
        style={[styles.band, { height: band, transform: [{ translateY: travel(-band, height) }] }]}
        testID="launch-band"
      >
        <BandShape width={width} height={band} slices={SLICES} />
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  black: { backgroundColor: markPalette.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  pinned: { position: 'absolute', left: 0 },
  window: { position: 'absolute', left: 0, right: 0, overflow: 'hidden' },
  band: { position: 'absolute', left: 0, right: 0, top: 0 },
});
