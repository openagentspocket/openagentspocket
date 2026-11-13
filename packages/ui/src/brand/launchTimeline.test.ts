import { cubicBezier } from './bezier';
import {
  bandSlices,
  hueLayers,
  initialLaunchGate,
  introTracks,
  LAUNCH,
  LAUNCH_TOTAL_MS,
  type LaunchEvent,
  launchGate,
  launchLayout,
  launchPhases,
  sampleTrack,
  trackAt,
} from './launchTimeline';

describe('launch timeline', () => {
  it('shows the app at about 2.3 s, after the mark is assembled and has held', () => {
    expect(LAUNCH_TOTAL_MS).toBe(2300);
    expect(LAUNCH.assembledMs).toBeLessThan(LAUNCH.introMs);
  });

  it('keeps the approved order: prompt, blink, card, fan, pocket, hold, sweep', () => {
    expect(launchPhases.map((p) => p.name)).toEqual([
      'prompt',
      'cursorBlink',
      'cardGrows',
      'fanOut',
      'pocketRises',
      'hold',
      'sweep',
    ]);
    for (let i = 1; i < launchPhases.length; i++) {
      expect(launchPhases[i]?.from).toBeGreaterThanOrEqual(launchPhases[i - 1]?.from ?? 0);
    }
    expect(launchPhases.at(-1)?.to).toBe(LAUNCH_TOTAL_MS);
  });

  it('ends every intro track by the time the mark is assembled, at the icon frame', () => {
    for (const track of Object.values(introTracks)) {
      if (track === introTracks.hue) continue;
      expect(track.keys.at(-1)?.[0]).toBeLessThanOrEqual(LAUNCH.assembledMs);
    }
    const at = (name: keyof typeof introTracks) => trackAt(introTracks[name], LAUNCH.assembledMs);
    expect([at('center'), at('rim'), at('sides'), at('pocket')]).toEqual([1, 1, 1, 1]);
    expect([at('prompt'), at('fill'), at('glow')]).toEqual([0, 0, 0]);
    expect(at('fan')).toBe(26);
    expect(at('pocketY')).toBe(0);
  });

  it('fans the side cards past their angle before they settle (the overshoot)', () => {
    expect(Math.max(...introTracks.fan.keys.map(([, v]) => v))).toBeGreaterThan(26);
  });

  it('samples a track into increasing points that hold to the end and follow the curve', () => {
    const sampled = sampleTrack(introTracks.pocketY, LAUNCH.introMs);
    expect(sampled.inputRange.at(-1)).toBe(LAUNCH.introMs);
    for (let i = 1; i < sampled.inputRange.length; i++) {
      expect(sampled.inputRange[i]).toBeGreaterThan(sampled.inputRange[i - 1] ?? 0);
    }
    sampled.inputRange.forEach((ms, i) => {
      expect(sampled.outputRange[i]).toBeCloseTo(trackAt(introTracks.pocketY, ms), 3);
    });
    // A still stretch costs two points, not one per frame.
    expect(sampled.inputRange.filter((ms) => ms <= 1080)).toEqual([0, 1080]);
  });

  it('crossfades the hue copies in turn', () => {
    expect(hueLayers(0)).toEqual({ middle: 0, last: 0 });
    expect(hueLayers(0.5)).toEqual({ middle: 1, last: 0 });
    expect(hueLayers(1)).toEqual({ middle: 1, last: 1 });
  });

  it('solves the CSS curves', () => {
    const ease = cubicBezier(0.42, 0, 0.58, 1);
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(0.5)).toBeCloseTo(0.5, 4);
    expect(cubicBezier(0.2, 0.8, 0.2, 1)(0.25)).toBeGreaterThan(0.6);
  });

  it('softens the band at both edges and keeps its middle opaque', () => {
    const slices = bandSlices(16);
    expect(slices[0]?.opacity).toBeLessThan(0.1);
    expect(slices.at(-1)?.opacity).toBeLessThan(0.1);
    expect(slices[8]?.opacity).toBe(1);
    expect(slices.reduce((sum, s) => sum + s.height, 0)).toBeCloseTo(1, 6);
  });

  it('sizes the mark and the band to the screen', () => {
    expect(launchLayout(390, 844)).toEqual({ mark: 324, band: 84 });
    expect(launchLayout(1024, 1366).mark).toBe(360);
  });
});

describe('launch gate', () => {
  const run = (ready: boolean, events: LaunchEvent[]) =>
    events.reduce(launchGate, initialLaunchGate(ready)).step;

  it('sweeps right after the intro when the app is ready', () => {
    expect(run(true, ['introDone'])).toBe('sweep');
    expect(run(false, ['ready', 'introDone'])).toBe('sweep');
  });

  it('holds the assembled mark until the app is ready', () => {
    expect(run(false, ['introDone'])).toBe('holding');
    expect(run(false, ['introDone', 'ready'])).toBe('sweep');
  });

  it('never holds forever', () => {
    expect(run(false, ['introDone', 'waitedTooLong'])).toBe('sweep');
    expect(run(false, ['waitedTooLong'])).toBe('intro');
  });

  it('is done only after the sweep', () => {
    expect(run(true, ['sweepDone'])).toBe('intro');
    expect(run(true, ['introDone', 'sweepDone'])).toBe('done');
  });
});
