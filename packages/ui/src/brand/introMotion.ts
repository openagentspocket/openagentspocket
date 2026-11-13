import type { Animated } from 'react-native';
import type { MarkMotion } from './AppMark';
import { hueLayers, type IntroTrackName, introTracks, LAUNCH, sampleTrack } from './launchTimeline';
import { markGeometry } from './mark.generated';

/**
 * The intro's values driven by one clock (milliseconds, 0 to `LAUNCH.introMs`) that runs on the
 * native driver: each value is a clamped interpolation of the clock over its sampled track, so the
 * whole intro plays on the UI thread while the app's JavaScript mounts underneath.
 */
export function introMotion(clock: Animated.Value, size: number): MarkMotion {
  const k = size / markGeometry.canvas;
  const sampled = (name: IntroTrackName) => sampleTrack(introTracks[name], LAUNCH.introMs);
  const drive = (name: IntroTrackName, map: (v: number) => number = (v) => v) => {
    const { inputRange, outputRange } = sampled(name);
    return clock.interpolate({
      inputRange,
      outputRange: outputRange.map(map),
      extrapolate: 'clamp',
    });
  };
  const angle = (sign: 1 | -1) => {
    const { inputRange, outputRange } = sampled('fan');
    return clock.interpolate<string>({
      inputRange,
      outputRange: outputRange.map((v) => `${sign * v}deg`),
      extrapolate: 'clamp',
    });
  };
  return {
    prompt: drive('prompt'),
    center: drive('center'),
    centerScaleX: drive('centerScaleX'),
    centerScaleY: drive('centerScaleY'),
    fill: drive('fill'),
    glow: drive('glow'),
    hueMiddle: drive('hue', (v) => hueLayers(v).middle),
    hueLast: drive('hue', (v) => hueLayers(v).last),
    rim: drive('rim'),
    sides: drive('sides'),
    rightAngle: angle(1),
    leftAngle: angle(-1),
    pocket: drive('pocket'),
    pocketY: drive('pocketY', (v) => v * k),
  };
}
