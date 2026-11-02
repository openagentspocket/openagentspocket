import { FakeClock } from '@openagentspocket/core';
import { OverlayHost, ThemeProvider } from '@openagentspocket/ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useEffect } from 'react';
import { Pressable } from 'react-native';
import { InAppBanner, useBannerDemo, useBannerFeed } from './InAppBanner';

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

type Agents = Parameters<ReturnType<typeof useBannerFeed>>[0];

function Feeder({ steps }: { steps: Agents[] }) {
  const feed = useBannerFeed();
  useEffect(() => {
    for (const step of steps) feed(step);
  }, [feed, steps]);
  return null;
}

function Trigger() {
  const demo = useBannerDemo();
  return <Pressable testID="demo" onPress={demo} />;
}

const steps: Agents[] = [
  [{ hostId: 'h', paneId: 'p', status: 'working', kind: 'claude', workspaceLabel: 'Caterm' }],
  [{ hostId: 'h', paneId: 'p', status: 'blocked', kind: 'claude', workspaceLabel: 'Caterm' }],
];

const mountWith = async (props: Partial<Parameters<typeof InAppBanner>[0]>, clock: FakeClock) =>
  render(
    <ThemeProvider themeId="indigo">
      <InAppBanner clock={clock} {...props}>
        <Feeder steps={steps} />
      </InAppBanner>
      <OverlayHost />
    </ThemeProvider>,
  );

describe('InAppBanner', () => {
  it('fails closed when the Host preferences are unknown', async () => {
    const clock = new FakeClock();
    await mountWith({}, clock);
    await act(() => clock.advance(4000));
    expect(screen.queryByTestId('in-app-banner')).toBeNull();
  });

  it('shows the held transition and a tap opens the Agent', async () => {
    const clock = new FakeClock();
    const openAgent = jest.fn();
    await mountWith({ triggers: () => ({ blocked: true, done: true }), openAgent }, clock);
    expect(screen.queryByTestId('in-app-banner')).toBeNull();
    await act(() => clock.advance(3000));
    await fireEvent.press(await screen.findByTestId('in-app-banner'));
    expect(openAgent).toHaveBeenCalledWith({ hostId: 'h', paneId: 'p' });
    await waitFor(() => expect(screen.queryByTestId('in-app-banner')).toBeNull());
  });

  it('shows the gallery demo trigger even when Host preferences are unknown', async () => {
    const clock = new FakeClock();
    await render(
      <ThemeProvider themeId="indigo">
        <InAppBanner clock={clock}>
          <Trigger />
        </InAppBanner>
        <OverlayHost />
      </ThemeProvider>,
    );
    await fireEvent.press(screen.getByTestId('demo'));
    await act(() => clock.advance(3000));
    expect(await screen.findByTestId('in-app-banner')).toBeTruthy();
  });

  it('pins a NoticeBanner at the top with the three-line mono question', async () => {
    const clock = new FakeClock();
    const feed: Agents[] = [
      [{ hostId: 'h', paneId: 'p', status: 'working', kind: 'claude', workspaceLabel: 'Caterm' }],
      [
        {
          hostId: 'h',
          paneId: 'p',
          status: 'blocked',
          kind: 'claude',
          workspaceLabel: 'Caterm',
          lastOutputSnippet: 'Allow the edit to Model.swift?',
        },
      ],
    ];
    await render(
      <ThemeProvider themeId="indigo">
        <InAppBanner clock={clock} triggers={() => ({ blocked: true, done: true })}>
          <Feeder steps={feed} />
        </InAppBanner>
      </ThemeProvider>,
    );
    await act(() => clock.advance(3000));
    expect(await screen.findByTestId('in-app-banner-layer')).toBeTruthy();
    const question = await screen.findByTestId('notice-inapp-question');
    expect(question.props.numberOfLines).toBe(3);
  });

  it('stays silent when that Agent is on screen', async () => {
    const clock = new FakeClock();
    await mountWith(
      {
        triggers: () => ({ blocked: true, done: true }),
        presentedAgent: () => ({ hostId: 'h', paneId: 'p' }),
      },
      clock,
    );
    await act(() => clock.advance(3000));
    expect(screen.queryByTestId('in-app-banner')).toBeNull();
  });
});
