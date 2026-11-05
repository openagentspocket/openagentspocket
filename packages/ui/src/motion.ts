import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing } from 'react-native';

/** Durations (ms) the Swift app uses; nothing animates longer than `MAX_MS`. */
export const timing = {
  /** Button press highlight (.easeOut 0.12). */
  press: 120,
  /** Scroll-to-bottom button, "more below" (.easeOut 0.15). */
  fade: 150,
  /** Lift (edge dock). */
  lift: 180,
  /** Toggle, drag settle, page switch (.snappy 0.2 / .easeInOut 0.2). */
  quick: 200,
  /** Availability change, drawer group. */
  settle: 220,
  /** Status color change (.smooth 0.25), composer height. */
  smooth: 250,
  /** Overlay open (.snappy 0.28). */
  overlay: 280,
  /** The house `.snappy` default, capped. */
  snappy: 350,
} as const;

export const MAX_MS = 350;

/** SwiftUI `.snappy`: critically damped with a hint of bounce. */
export const snappySpring = { damping: 20, stiffness: 220, mass: 1 } as const;

export type MotionKey = keyof typeof timing;

/** True when the system asks for less motion; animations then jump to their end value. */
export function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled?.().then((value) => {
      if (mounted) setReduce(value);
    });
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReduce);
    return () => {
      mounted = false;
      sub?.remove();
    };
  }, []);
  return reduce;
}

/** A `.snappy` spring toward `toValue` (or a jump under Reduce Motion). Native driver. */
export function snappy(
  value: Animated.Value,
  toValue: number,
  reduceMotion: boolean,
): Animated.CompositeAnimation {
  if (reduceMotion) return Animated.timing(value, { toValue, duration: 0, useNativeDriver: true });
  return Animated.spring(value, {
    toValue,
    damping: snappySpring.damping,
    stiffness: snappySpring.stiffness,
    mass: snappySpring.mass,
    useNativeDriver: true,
  });
}

/** An ease-in-out timing toward `toValue` (`.easeInOut`, `.easeOut`), or a jump under Reduce Motion. */
export function quick(
  value: Animated.Value,
  toValue: number,
  reduceMotion: boolean,
  key: MotionKey = 'quick',
): Animated.CompositeAnimation {
  return Animated.timing(value, {
    toValue,
    duration: reduceMotion ? 0 : timing[key],
    easing: Easing.inOut(Easing.ease),
    useNativeDriver: true,
  });
}

/** Swift's Working pulse (agent chip dot): opacity 1 to 0.25 and back, 0.75 s each way, forever. */
export const PULSE = { low: 0.25, halfPeriodMs: 750 } as const;

/**
 * An opacity that pulses while `active` and Reduce Motion is off, and stays 1 otherwise. Working is
 * the one status worth animating: a still dot cannot tell a busy Agent from an idle one.
 */
export function usePulse(active: boolean): Animated.Value {
  const reduce = useReducedMotion();
  const [opacity] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (!active || reduce) {
      opacity.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: PULSE.low,
          duration: PULSE.halfPeriodMs,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: PULSE.halfPeriodMs,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, reduce, opacity]);
  return opacity;
}
