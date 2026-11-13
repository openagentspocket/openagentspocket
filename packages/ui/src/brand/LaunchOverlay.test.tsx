import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { LaunchOverlay } from './LaunchOverlay';
import { LAUNCH, LAUNCH_TOTAL_MS } from './launchTimeline';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const layout = { nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 844 } } };
const hidden = { includeHiddenElements: true };
const advance = (ms: number) =>
  act(async () => {
    jest.advanceTimersByTime(ms);
  });

async function show(props: { ready: boolean; reduceMotion: boolean | null }) {
  const onDone = jest.fn();
  await render(<LaunchOverlay {...props} onDone={onDone} />);
  await fireEvent(screen.getByTestId('launch-overlay', hidden), 'layout', layout);
  const rerender = (ready: boolean) =>
    screen.rerender(<LaunchOverlay {...props} ready={ready} onDone={onDone} />);
  return { onDone, rerender };
}

describe('LaunchOverlay', () => {
  it('covers the app without taking touches or reaching accessibility', async () => {
    await show({ ready: true, reduceMotion: false });
    const overlay = screen.getByTestId('launch-overlay', hidden);
    expect(overlay.props.pointerEvents).toBe('none');
    expect(overlay.props.accessibilityElementsHidden).toBe(true);
    expect(StyleSheet.flatten(overlay.props.style)).toMatchObject({ position: 'absolute' });
  });

  it('assembles the mark, sweeps, and leaves the tree when the app is ready', async () => {
    const { onDone } = await show({ ready: true, reduceMotion: false });
    expect(screen.getByTestId('launch-band', hidden)).toBeTruthy();
    await advance(LAUNCH.introMs + 50);
    expect(onDone).not.toHaveBeenCalled();
    await advance(LAUNCH.sweepMs + 50);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('launch-overlay', hidden)).toBeNull();
  });

  it('holds the assembled mark until the app is ready, then sweeps', async () => {
    const { onDone, rerender } = await show({ ready: false, reduceMotion: false });
    await advance(LAUNCH_TOTAL_MS + 1000);
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByTestId('app-mark', hidden)).toBeTruthy();
    await rerender(true);
    await advance(LAUNCH.sweepMs + 100);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('never waits for the app forever', async () => {
    const { onDone } = await show({ ready: false, reduceMotion: false });
    await advance(LAUNCH.introMs + 50);
    await advance(LAUNCH.maxWaitMs + 50);
    expect(onDone).not.toHaveBeenCalled();
    await advance(LAUNCH.sweepMs + 50);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('under Reduce Motion shows the still mark and fades, with no band', async () => {
    const { onDone } = await show({ ready: true, reduceMotion: true });
    expect(screen.queryByTestId('launch-band', hidden)).toBeNull();
    expect(screen.getByTestId('app-mark', hidden)).toBeTruthy();
    await advance(LAUNCH.reduce.holdMs + 50);
    await advance(LAUNCH.reduce.fadeMs + 50);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('stays black and still until it knows the Reduce Motion setting', async () => {
    const { onDone } = await show({ ready: true, reduceMotion: null });
    expect(screen.queryByTestId('app-mark', hidden)).toBeNull();
    await advance(LAUNCH_TOTAL_MS + 100);
    expect(onDone).not.toHaveBeenCalled();
  });
});
