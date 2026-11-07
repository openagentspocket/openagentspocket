import { MemoryStorage, SettingsStore } from '@openagentspocket/core';
import { ThemeProvider } from '@openagentspocket/ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus, Linking } from 'react-native';
import {
  createDemoNotificationServices,
  NotificationServicesProvider,
} from '@/notifications/services';
import { AppLockCover } from '@/settings/AppLockCover';
import { AppLockProvider } from '@/settings/AppLockProvider';
import type { AuthResult } from '@/settings/authenticator';
import { fakeAuthenticator, guardAuthenticator } from '@/settings/authenticator';
import { SettingsProvider } from '@/settings/SettingsProvider';
import { activityLinkOf, LiveActivityActions, resetInitialUrlAnswer } from './LiveActivityActions';

const HOST_ID = '6A1F4E0C-2B7D-4C3A-9E51-0D8B7F6A2C19';
const BID = 'abcdefghijk';
const LINK = `agentico://agent/${HOST_ID}/w1%3Ap1?answer=approve&bid=${BID}`;
const TARGET = { hostId: HOST_ID, paneId: 'w1:p1', episodeId: BID };
const ASK = {
  episodeId: BID,
  denyOnly: false,
  prompt: 'Run ls?',
  options: ['Yes', 'No'],
  timestamp: 1000,
};
const REVIEW = { kind: 'ask', ask: ASK, approve: 'Yes', deny: 'No', approveRefusal: null };
const SHOWS_NOTHING = { kind: 'nothing', outcome: 'promptChanged' };

const mockToast = jest.fn();
jest.mock('@openagentspocket/ui', () => ({
  ...jest.requireActual('@openagentspocket/ui'),
  toast: (toast: unknown) => mockToast(toast),
}));

interface MountOptions {
  review?: object;
  answer?: jest.Mock;
  lockOn?: boolean;
  authenticate?: () => Promise<AuthResult>;
}

async function mount({ review = REVIEW, answer, lockOn = false, authenticate }: MountOptions = {}) {
  const reviewLink = jest.fn(async (_link: unknown) => ({ ...review, host: 'mbp' }));
  const sent = answer ?? jest.fn(async () => ({ outcome: 'answered', host: 'mbp' }));
  const services = {
    ...createDemoNotificationServices(),
    liveActivity: {
      activitiesEnabled: true,
      isEnabled: () => true,
      setEnabled: () => undefined,
      review: reviewLink,
      answer: sent,
    },
  };
  const store = new SettingsStore(new MemoryStorage());
  store.update({ appLockEnabled: lockOn });
  const authenticator = authenticate
    ? guardAuthenticator(async () => 'Face ID', authenticate)
    : fakeAuthenticator('Face ID', true);
  await render(
    <ThemeProvider themeId="indigo">
      <SettingsProvider store={store} authenticator={authenticator}>
        <AppLockProvider>
          <NotificationServicesProvider services={services as never}>
            <LiveActivityActions />
          </NotificationServicesProvider>
          <AppLockCover />
        </AppLockProvider>
      </SettingsProvider>
    </ThemeProvider>,
  );
  return { reviewLink, answer: sent };
}

const settled = () => act(async () => new Promise<void>((resolve) => setImmediate(resolve)));

describe('LiveActivityActions', () => {
  let emit: (event: { url: string }) => void = () => undefined;
  let emitState: (state: AppStateStatus) => void = () => undefined;

  const receive = async (url = LINK) => {
    await act(async () => emit({ url }));
    await settled();
  };

  beforeEach(() => {
    resetInitialUrlAnswer();
    mockToast.mockClear();
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
    jest.spyOn(Linking, 'addEventListener').mockImplementation(((
      _type: string,
      listener: typeof emit,
    ) => {
      emit = listener;
      return { remove: () => undefined };
    }) as never);
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((
      _type: string,
      listener: typeof emitState,
    ) => {
      emitState = listener;
      return { remove: () => undefined };
    }) as never);
  });

  afterEach(() => jest.restoreAllMocks());

  it('reads a target only from an answer link naming a Host id and a pane', () => {
    expect(activityLinkOf(LINK)).toEqual(TARGET);
    expect(activityLinkOf(`agentico://agent/${HOST_ID}/w1%3Ap1`)).toBeNull();
    expect(activityLinkOf('agentico://agent?host=box&pane=p&answer=deny&bid=b')).toBeNull();
  });

  it.each(['approve', 'deny'])('a link saying %s alone answers nothing', async (decision) => {
    const { reviewLink, answer } = await mount();
    await receive(LINK.replace('answer=approve', `answer=${decision}`));
    expect(reviewLink).toHaveBeenCalledWith(TARGET);
    expect(screen.getByTestId('activity-confirm-prompt')).toBeTruthy();
    expect(answer).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('shows what the Host reports, never text from the link', async () => {
    await mount();
    await receive(`${LINK}&q=Forged&prompt=Forged&label=Forged`);
    expect(screen.getByTestId('activity-confirm-prompt')).toHaveTextContent('Run ls?');
    expect(screen.queryByText(/Forged/)).toBeNull();
  });

  it('a tap on Deny answers Deny, whatever the link said', async () => {
    const { answer } = await mount();
    await receive();
    await act(async () => fireEvent.press(screen.getByTestId('activity-confirm-deny')));
    await settled();
    expect(answer).toHaveBeenCalledTimes(1);
    expect(answer).toHaveBeenCalledWith({ ...TARGET, decision: 'deny', shown: ASK });
    expect(screen.queryByTestId('activity-confirm-prompt')).toBeNull();
  });

  it('a tap on Approve goes on to the gates and tells what it came to', async () => {
    const answer = jest.fn(async () => ({ outcome: 'promptChanged', host: 'mbp' }));
    await mount({ answer });
    await receive(LINK.replace('answer=approve', 'answer=deny'));
    await act(async () => fireEvent.press(screen.getByTestId('activity-confirm-approve')));
    await settled();
    expect(answer).toHaveBeenCalledWith({ ...TARGET, decision: 'approve', shown: ASK });
    expect(mockToast).toHaveBeenCalledTimes(1);
  });

  it('Cancel answers nothing', async () => {
    const { answer } = await mount();
    await receive();
    await act(async () => fireEvent.press(screen.getByTestId('activity-confirm-cancel')));
    await settled();
    expect(answer).not.toHaveBeenCalled();
    expect(screen.queryByTestId('activity-confirm-prompt')).toBeNull();
  });

  it('offers only what can be answered', async () => {
    await mount({ review: { ...REVIEW, approve: null, approveRefusal: 'denyOnly' } });
    await receive();
    expect(screen.queryByTestId('activity-confirm-approve')).toBeNull();
    expect(screen.getByTestId('activity-confirm-deny')).toBeTruthy();
  });

  it('a stale or unknown link shows nothing to answer', async () => {
    const { answer } = await mount({ review: SHOWS_NOTHING });
    await receive();
    expect(screen.getByTestId('activity-confirm-nothing')).toBeTruthy();
    expect(screen.queryByTestId('activity-confirm-approve')).toBeNull();
    expect(screen.queryByTestId('activity-confirm-deny')).toBeNull();
    expect(answer).not.toHaveBeenCalled();
  });

  it('under App Lock nothing shows and nothing runs; after unlock it reads the Host', async () => {
    const authenticate = jest.fn(async (): Promise<AuthResult> => 'cancelled');
    const { reviewLink, answer } = await mount({ lockOn: true, authenticate });
    await settled();
    expect(screen.getByTestId('app-lock-cover')).toBeTruthy();
    await receive();
    expect(reviewLink).not.toHaveBeenCalled();
    expect(answer).not.toHaveBeenCalled();
    expect(screen.queryByTestId('activity-confirm')).toBeNull();

    authenticate.mockResolvedValueOnce('success');
    await act(async () => fireEvent.press(screen.getByTestId('app-lock-unlock')));
    await settled();
    expect(reviewLink).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('activity-confirm-prompt')).toBeTruthy();
    expect(answer).not.toHaveBeenCalled();
  });

  it('a cover that comes up takes the sheet away and reads again when it lifts', async () => {
    const { reviewLink } = await mount({ lockOn: true });
    await settled();
    await receive();
    await act(async () => emitState('inactive'));
    expect(screen.queryByTestId('activity-confirm-prompt')).toBeNull();
    await act(async () => emitState('active'));
    await settled();
    expect(reviewLink).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('activity-confirm-prompt')).toBeTruthy();
  });

  it('a link never swaps the prompt the owner is reading', async () => {
    const { reviewLink } = await mount();
    await receive();
    await receive(LINK.replace('w1%3Ap1', 'w1%3Ap2'));
    expect(reviewLink).toHaveBeenCalledTimes(1);
  });

  it('reviews the link that launched the app, once per process', async () => {
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(LINK);
    const first = await mount();
    await waitFor(() => expect(first.reviewLink).toHaveBeenCalledWith(TARGET));
    const second = await mount();
    await settled();
    expect(second.reviewLink).not.toHaveBeenCalled();
    expect(first.answer).not.toHaveBeenCalled();
  });

  it('ignores a plain link', async () => {
    const { reviewLink } = await mount();
    await receive(`agentico://agent/${HOST_ID}/w1%3Ap1`);
    expect(reviewLink).not.toHaveBeenCalled();
    expect(screen.queryByTestId('activity-confirm')).toBeNull();
  });
});
