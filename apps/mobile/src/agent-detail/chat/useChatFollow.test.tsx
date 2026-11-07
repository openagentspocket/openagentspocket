import { render } from '@testing-library/react-native';
import type { RefObject } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useChatFollow } from './useChatFollow';

const scrolled = (fromEnd: number) =>
  ({
    nativeEvent: {
      contentOffset: { y: 1000 - 500 - fromEnd },
      contentSize: { height: 1000 },
      layoutMeasurement: { height: 500 },
    },
  }) as NativeSyntheticEvent<NativeScrollEvent>;

let follow: ReturnType<typeof useChatFollow>;

function Probe({
  list,
  sent,
  visit,
}: {
  list: RefObject<{ scrollToEnd: jest.Mock }>;
  sent: number;
  visit?: number;
}) {
  follow = useChatFollow(list, sent, visit);
  return null;
}

async function setup() {
  const scrollToEnd = jest.fn();
  const list = { current: { scrollToEnd } };
  const view = await render(<Probe list={list} sent={0} />);
  const send = () => view.rerender(<Probe list={list} sent={1} />);
  return { scrollToEnd, send, list, view };
}

describe('following the end of a conversation', () => {
  afterEach(() => jest.useRealTimers());

  it('stays on the end when the list changes size, and lands again once rows are measured', async () => {
    const { scrollToEnd, send } = await setup();
    jest.useFakeTimers();
    follow.onLayout();
    expect(scrollToEnd).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(400);
    expect(scrollToEnd).toHaveBeenCalledTimes(3);
  });

  it('leaves a reader who scrolled up alone', async () => {
    const { scrollToEnd, send } = await setup();
    follow.onScrollBeginDrag();
    follow.onScrollEndDrag(scrolled(600));
    follow.onContentSizeChange();
    expect(scrollToEnd).not.toHaveBeenCalled();
  });

  it('coming back to the conversation lands a reader who scrolled up on its end', async () => {
    const { scrollToEnd, list, view } = await setup();
    follow.onScrollBeginDrag();
    follow.onScrollEndDrag(scrolled(600));
    await view.rerender(<Probe list={list} sent={0} visit={1} />);
    expect(scrollToEnd).toHaveBeenCalledTimes(1);
    follow.onContentSizeChange();
    expect(scrollToEnd).toHaveBeenCalledTimes(2);
  });

  it('a message sent brings a reader who scrolled up back to the end', async () => {
    const { scrollToEnd, send } = await setup();
    follow.onScrollBeginDrag();
    follow.onScrollEndDrag(scrolled(600));
    await send();
    expect(scrollToEnd).toHaveBeenCalled();
  });

  it('a drag near the end keeps following', async () => {
    const { scrollToEnd, send } = await setup();
    follow.onScrollBeginDrag();
    follow.onScrollEndDrag(scrolled(50));
    follow.onContentSizeChange();
    expect(scrollToEnd).toHaveBeenCalled();
  });
});
