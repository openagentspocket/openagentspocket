import { fingerprintFromDigest } from '@openagentspocket/core';
import { OverlayHost, ThemeProvider } from '@openagentspocket/ui';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { askToTrust, TrustPromptQueue } from './trustPrompt';

const candidate = {
  host: 'workshop.example',
  port: 22,
  fingerprint: fingerprintFromDigest(
    Uint8Array.from({ length: 32 }, (_, i) => i),
    'ssh-ed25519',
  ),
};

const renderHost = () =>
  render(
    <ThemeProvider themeId="indigo">
      <OverlayHost />
    </ThemeProvider>,
  );

describe('askToTrust', () => {
  afterEach(() => jest.useRealTimers());

  it('takes the prompt off the screen when nobody answers, and says so', async () => {
    jest.useFakeTimers();
    await renderHost();
    let answer!: Promise<unknown>;
    await act(async () => {
      answer = askToTrust(candidate, 1_000);
    });
    expect(screen.getByTestId('alert-alert')).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(1_000);
    });
    await expect(answer).resolves.toBe('unanswered');
    expect(screen.queryByTestId('alert-alert')).toBeNull();
  });

  it("answers false only when the user taps Don't Trust", async () => {
    await renderHost();
    let answer!: Promise<unknown>;
    await act(async () => {
      answer = askToTrust(candidate, 60_000);
    });
    await fireEvent.press(screen.getByTestId('alert-cancel'));
    await expect(answer).resolves.toBe(false);
  });
});

describe('TrustPromptQueue', () => {
  it('asks again after a prompt nobody answered, instead of reusing it as a refusal', async () => {
    const answers: ('unanswered' | boolean)[] = ['unanswered', true];
    let asked = 0;
    const queue = new TrustPromptQueue(async () => {
      asked += 1;
      return answers.shift() ?? false;
    });
    expect(await queue.confirm(candidate)).toBe('unanswered');
    expect(await queue.confirm(candidate)).toBe(true);
    expect(asked).toBe(2);
  });

  it('reuses a decline for a moment, so two consumers never ask twice about one key', async () => {
    let asked = 0;
    let now = 0;
    const queue = new TrustPromptQueue(
      async () => {
        asked += 1;
        return false;
      },
      () => now,
    );
    expect(await queue.confirm(candidate)).toBe(false);
    now = 5_000;
    expect(await queue.confirm(candidate)).toBe(false);
    expect(asked).toBe(1);
  });
});
