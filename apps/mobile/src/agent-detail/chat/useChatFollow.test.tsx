import { render } from '@testing-library/react-native';
import type { RefObject } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useChatFollow } from './useChatFollow';

type Scroller = { scrollToOffset: jest.Mock };
let follow: ReturnType<typeof useChatFollow>;

function Probe({ list, sent, visit }: { list: RefObject<Scroller>; sent: number; visit: number }) {
  follow = useChatFollow(list, sent, visit);
  return null;
}

async function setup() {
  const scrollToOffset = jest.fn();
  const list = { current: { scrollToOffset } };
  const listeners: ((state: AppStateStatus) => void)[] = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    listeners.push(listener as (state: AppStateStatus) => void);
    return { remove: jest.fn() } as never;
  });
  const view = await render(<Probe list={list} sent={0} visit={0} />);
  const props = (sent: number, visit: number) =>
    view.rerender(<Probe list={list} sent={sent} visit={visit} />);
  const appState = (state: AppStateStatus) => {
    for (const listener of listeners) listener(state);
  };
  return { scrollToOffset, props, appState };
}

const NEWEST = { offset: 0, animated: false };

describe('following the newest row of an inverted timeline', () => {
  afterEach(() => jest.restoreAllMocks());

  it('lets the list hold a reader who scrolled up, and follow one near the newest row', async () => {
    await setup();
    expect(follow.maintainVisibleContentPosition).toEqual({
      minIndexForVisible: 0,
      autoscrollToTopThreshold: expect.any(Number),
    });
  });

  it('a message sent brings the reader to the newest row', async () => {
    const { scrollToOffset, props } = await setup();
    await props(1, 0);
    expect(scrollToOffset).toHaveBeenCalledWith(NEWEST);
  });

  it('coming back to the screen brings the reader to the newest row', async () => {
    const { scrollToOffset, props } = await setup();
    await props(0, 1);
    expect(scrollToOffset).toHaveBeenCalledWith(NEWEST);
  });

  it('coming back from the background brings the reader to the newest row', async () => {
    const { scrollToOffset, appState } = await setup();
    appState('background');
    appState('active');
    expect(scrollToOffset).toHaveBeenCalledWith(NEWEST);
  });

  it('a Face ID prompt (inactive, then active) leaves the reader where they were', async () => {
    const { scrollToOffset, appState } = await setup();
    appState('inactive');
    appState('active');
    expect(scrollToOffset).not.toHaveBeenCalled();
  });
});
