import { LAUNCH } from '@openagentspocket/ui';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { isHarnessPath, LaunchAnimation, resetLaunchAnimation } from './LaunchAnimation';

let mockPathname = '/';
let mockNavState: { key: string } | undefined = { key: 'root' };
jest.mock('expo-router', () => ({
  usePathname: () => mockPathname,
  useRootNavigationState: () => mockNavState,
}));

const hidden = { includeHiddenElements: true };
const advance = (ms: number) =>
  act(async () => {
    jest.advanceTimersByTime(ms);
  });

beforeEach(() => {
  jest.useFakeTimers();
  resetLaunchAnimation();
  mockPathname = '/';
  mockNavState = { key: 'root' };
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
});
afterEach(() => jest.useRealTimers());

async function playOnce() {
  await render(<LaunchAnimation />);
  await fireEvent(screen.getByTestId('launch-overlay', hidden), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 844 } },
  });
  await advance(LAUNCH.reduce.holdMs + 50);
  await advance(LAUNCH.reduce.fadeMs + 50);
}

describe('LaunchAnimation', () => {
  it('plays over the app at a cold start and is gone after it', async () => {
    await playOnce();
    expect(screen.queryByTestId('launch-overlay', hidden)).toBeNull();
  });

  it('plays once per process: a remounted root does not replay it', async () => {
    await playOnce();
    await screen.unmount();
    await render(<LaunchAnimation />);
    expect(screen.queryByTestId('launch-overlay', hidden)).toBeNull();
  });

  it('never covers a development harness', async () => {
    mockPathname = '/__atlas/home';
    await render(<LaunchAnimation />);
    expect(screen.queryByTestId('launch-overlay', hidden)).toBeNull();
    expect(isHarnessPath('/__gallery')).toBe(true);
    expect(isHarnessPath('/settings')).toBe(false);
  });

  it('holds until the root navigator is ready', async () => {
    mockNavState = undefined;
    await render(<LaunchAnimation />);
    await fireEvent(screen.getByTestId('launch-overlay', hidden), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 844 } },
    });
    await advance(LAUNCH.reduce.holdMs + 50);
    await advance(LAUNCH.reduce.fadeMs + 50);
    expect(screen.getByTestId('launch-overlay', hidden)).toBeTruthy();
    mockNavState = { key: 'root' };
    await screen.rerender(<LaunchAnimation />);
    await advance(LAUNCH.reduce.fadeMs + 50);
    expect(screen.queryByTestId('launch-overlay', hidden)).toBeNull();
  });
});
