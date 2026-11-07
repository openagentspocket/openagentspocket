import { render, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import {
  createDemoNotificationServices,
  NotificationServicesProvider,
} from '@/notifications/services';
import { activityTapOf, LiveActivityActions, resetInitialUrlAnswer } from './LiveActivityActions';

const HOST_ID = '6A1F4E0C-2B7D-4C3A-9E51-0D8B7F6A2C19';
const LINK = `agentico://agent/${HOST_ID}/w1%3Ap1?answer=approve&bid=abcdefghijk`;
const TAP = { hostId: HOST_ID, paneId: 'w1:p1', episodeId: 'abcdefghijk', decision: 'approve' };

const mockToast = jest.fn();
jest.mock('@openagentspocket/ui', () => ({ toast: (toast: unknown) => mockToast(toast) }));

async function mount(answer: jest.Mock) {
  const services = {
    ...createDemoNotificationServices(),
    liveActivity: {
      activitiesEnabled: true,
      isEnabled: () => true,
      setEnabled: () => undefined,
      answer,
    },
  };
  return render(
    <NotificationServicesProvider services={services}>
      <LiveActivityActions />
    </NotificationServicesProvider>,
  );
}

describe('LiveActivityActions', () => {
  let emit: (event: { url: string }) => void = () => undefined;

  beforeEach(() => {
    resetInitialUrlAnswer();
    mockToast.mockClear();
    jest.spyOn(Linking, 'addEventListener').mockImplementation(((
      _type: string,
      listener: typeof emit,
    ) => {
      emit = listener;
      return { remove: () => undefined };
    }) as never);
  });

  afterEach(() => jest.restoreAllMocks());

  it('reads a tap only from an answer link naming a Host id and a pane', () => {
    expect(activityTapOf(LINK)).toEqual(TAP);
    expect(activityTapOf(`agentico://agent/${HOST_ID}/w1%3Ap1`)).toBeNull();
    expect(activityTapOf('agentico://agent?host=box&pane=p&answer=deny&bid=b')).toBeNull();
  });

  it('answers the link that launched the app, once per process', async () => {
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(LINK);
    const answer = jest.fn(async (_tap: unknown) => ({ outcome: 'answered', host: 'mbp' }));
    await mount(answer);
    await waitFor(() => expect(answer).toHaveBeenCalledWith(TAP));
    await mount(answer);
    await new Promise<void>((resolve) => setImmediate(() => resolve()));
    expect(answer).toHaveBeenCalledTimes(1);
  });

  it('answers a link that arrives while running and tells what it came to', async () => {
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
    const answer = jest.fn(async (_tap: unknown) => ({ outcome: 'promptChanged', host: 'mbp' }));
    await mount(answer);
    emit({ url: LINK });
    await waitFor(() => expect(mockToast).toHaveBeenCalledTimes(1));
    expect(answer).toHaveBeenCalledWith(TAP);
  });

  it('says nothing for a plain link or a tap already running', async () => {
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
    const answer = jest.fn(async (_tap: unknown) => null);
    await mount(answer);
    emit({ url: `agentico://agent/${HOST_ID}/w1%3Ap1` });
    expect(answer).not.toHaveBeenCalled();
    emit({ url: LINK });
    await waitFor(() => expect(answer).toHaveBeenCalledTimes(1));
    expect(mockToast).not.toHaveBeenCalled();
  });
});
