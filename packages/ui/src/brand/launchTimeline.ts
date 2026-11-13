import { cubicBezier, type Ease } from './bezier';
import { markGeometry } from './mark.generated';

/**
 * The launch, as data. Times are milliseconds from the start of the overlay. The approved sketch
 * ran 3.6 s with the mark assembled at 1.44 s; the hold after it is shortened so the app shows at
 * 2.3 s. Every value below is a keyframe of that sketch (its percentages times 36).
 */
export const LAUNCH = {
  /** The mark is whole (the pocket settled). */
  assembledMs: 1440,
  /** End of the intro: the assembled mark has held, the sweep may start. */
  introMs: 1650,
  /** The band travels from the top of the screen to the bottom. */
  sweepMs: 650,
  /** Past the intro, the mark waits this long for the app at most, then sweeps anyway. */
  maxWaitMs: 4000,
  /** Reduce Motion: the still mark, then a short fade to the app. */
  reduce: { holdMs: 400, fadeMs: 300 },
} as const;

/** Total time to the app when it is ready in time. */
export const LAUNCH_TOTAL_MS = LAUNCH.introMs + LAUNCH.sweepMs;

/** What happens when, in order (the hold and the sweep wait for the app when it is late). */
export const launchPhases = [
  { name: 'prompt', from: 0, to: 432 },
  { name: 'cursorBlink', from: 144, to: 270 },
  { name: 'cardGrows', from: 360, to: 936 },
  { name: 'fanOut', from: 792, to: 1224 },
  { name: 'pocketRises', from: 1080, to: LAUNCH.assembledMs },
  { name: 'hold', from: LAUNCH.assembledMs, to: LAUNCH.introMs },
  { name: 'sweep', from: LAUNCH.introMs, to: LAUNCH_TOTAL_MS },
] as const;

/** The sketch's timing function for every intro keyframe segment. */
export const INTRO_EASE: Ease = cubicBezier(0.2, 0.8, 0.2, 1);
/** The band's timing function. */
export const SWEEP_BEZIER = [0.5, 0, 0.3, 1] as const;
const HUE_EASE: Ease = cubicBezier(0.42, 0, 0.58, 1);
/** One leg of the border's hue drift (the sketch alternates every 1.6 s). */
const HUE_LEG_MS = 1600;

export type Keyframe = readonly [at: number, value: number];
export interface Track {
  keys: readonly Keyframe[];
  ease: Ease;
}

const intro = (...keys: Keyframe[]): Track => ({ keys, ease: INTRO_EASE });
const fan = markGeometry.fanAngle;

/**
 * Every animated value of the intro. Opacities are 0..1, scales are factors, `fan` is the right
 * card's angle in degrees (the left card mirrors it), `pocketY` is in canvas units (1024), `hue`
 * is the drift's progress from its first hue (0) to its last (1).
 */
export const introTracks = {
  prompt: intro([0, 1], [324, 1], [432, 0]),
  center: intro([0, 1], [144, 1], [162, 0], [252, 0], [270, 1]),
  centerScaleX: intro([0, 0.26], [360, 0.26], [720, 1.05], [828, 1]),
  centerScaleY: intro([0, 0.2], [360, 0.2], [720, 1.05], [828, 1]),
  fill: intro([0, 1], [360, 1], [756, 0]),
  glow: intro([0, 1], [468, 1], [864, 0]),
  rim: intro([0, 0], [576, 0], [936, 1]),
  sides: intro([0, 0], [792, 0], [828, 1]),
  fan: intro([0, 0], [828, 0], [1080, fan + 6], [1224, fan]),
  pocket: intro([0, 0], [1080, 0], [1332, 1]),
  pocketY: intro([0, 130], [1080, 130], [1332, -8], [LAUNCH.assembledMs, 0]),
  hue: {
    keys: [
      [0, 0],
      [HUE_LEG_MS, 1],
    ],
    ease: HUE_EASE,
  },
} satisfies Record<string, Track>;

export type IntroTrackName = keyof typeof introTracks;

export interface Sampled {
  inputRange: number[];
  outputRange: number[];
}

/**
 * A track as the points a native-driven interpolation can take (it cannot run an easing
 * function): a moving segment sampled every `stepMs`, a still one by its two ends, held to `endMs`.
 */
export function sampleTrack({ keys, ease }: Track, endMs: number, stepMs = 16): Sampled {
  const inputRange: number[] = [];
  const outputRange: number[] = [];
  const push = (at: number, value: number) => {
    if (inputRange.length > 0 && at <= (inputRange.at(-1) ?? 0)) return;
    inputRange.push(at);
    outputRange.push(Math.round(value * 10000) / 10000);
  };
  for (let i = 0; i < keys.length; i++) {
    const [at, value] = keys[i] as Keyframe;
    const next = keys[i + 1];
    push(at, value);
    if (!next || next[1] === value) continue;
    const span = next[0] - at;
    for (let t = stepMs; t < span; t += stepMs)
      push(at + t, value + (next[1] - value) * ease(t / span));
  }
  const last = keys.at(-1) as Keyframe;
  if (last[0] < endMs) push(endMs, last[1]);
  return { inputRange, outputRange };
}

/** The value a track has at `ms` (what the sampled points approximate). */
export function trackAt({ keys, ease }: Track, ms: number): number {
  const first = keys[0] as Keyframe;
  if (ms <= first[0]) return first[1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [a, va] = keys[i] as Keyframe;
    const [b, vb] = keys[i + 1] as Keyframe;
    if (ms <= b) return va + (vb - va) * ease((ms - a) / (b - a));
  }
  return (keys.at(-1) as Keyframe)[1];
}

/**
 * The drift crossfades three copies of the border, hue-rotated to its first, middle and last
 * hue: the first is always drawn, the middle fades in over the first half, the last over the
 * second. Returns the middle and last copies' opacities for a drift progress.
 */
export function hueLayers(progress: number): { middle: number; last: number } {
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  return { middle: clamp(progress * 2), last: clamp(progress * 2 - 1) };
}

/** Where the launch is. The sweep (or the Reduce Motion fade) starts only when the app is ready. */
export type LaunchStep = 'intro' | 'holding' | 'sweep' | 'done';
export interface LaunchGate {
  step: LaunchStep;
  ready: boolean;
}
export type LaunchEvent = 'introDone' | 'ready' | 'waitedTooLong' | 'sweepDone';

export const initialLaunchGate = (ready: boolean): LaunchGate => ({ step: 'intro', ready });

export function launchGate(state: LaunchGate, event: LaunchEvent): LaunchGate {
  switch (event) {
    case 'introDone':
      return state.step === 'intro' ? { ...state, step: state.ready ? 'sweep' : 'holding' } : state;
    case 'ready':
      return { ready: true, step: state.step === 'holding' ? 'sweep' : state.step };
    case 'waitedTooLong':
      return state.step === 'holding' ? { ...state, step: 'sweep' } : state;
    case 'sweepDone':
      return state.step === 'sweep' ? { ...state, step: 'done' } : state;
  }
}

/** The band's soft edges: horizontal slices, opaque in the middle third, easing to clear at both ends. */
export function bandSlices(count = 16): { top: number; height: number; opacity: number }[] {
  return Array.from({ length: count }, (_, i) => {
    const middle = (i + 0.5) / count;
    const d = Math.min(1, Math.min(middle, 1 - middle) * 3);
    return {
      top: i / count,
      height: 1 / count,
      opacity: Math.round(d * d * (3 - 2 * d) * 1000) / 1000,
    };
  });
}

/** The mark's box and the band's height for a screen. */
export function launchLayout(width: number, height: number): { mark: number; band: number } {
  return {
    mark: Math.round(Math.min(width * 0.83, height * 0.45, 360)),
    band: Math.round(Math.min(120, Math.max(48, height * 0.1))),
  };
}
