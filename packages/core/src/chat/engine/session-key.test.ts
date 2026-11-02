import { describe, expect, it } from 'vitest';
import { chatHerdrSession } from './session-key';

describe('chatHerdrSession', () => {
  it('is empty for the default session', () => {
    expect(chatHerdrSession({ sessionName: '', herdrEndpoint: null })).toBe('');
    expect(chatHerdrSession(undefined)).toBe('');
  });

  it('names a configured session', () => {
    expect(chatHerdrSession({ sessionName: ' work ', herdrEndpoint: null })).toBe('name:work');
  });

  it('reads the session an endpoint socket belongs to, and falls back to its path', () => {
    const exe = '/usr/bin/herdr';
    expect(
      chatHerdrSession({
        sessionName: 'ignored',
        herdrEndpoint: {
          socketPath: '/home/u/.config/herdr/sessions/dev/herdr.sock',
          executablePath: exe,
        },
      }),
    ).toBe('name:dev');
    expect(
      chatHerdrSession({
        sessionName: '',
        herdrEndpoint: { socketPath: '/home/u/.config/herdr/herdr.sock', executablePath: exe },
      }),
    ).toBe('');
    expect(
      chatHerdrSession({
        sessionName: '',
        herdrEndpoint: { socketPath: '/run/custom/api.sock', executablePath: exe },
      }),
    ).toBe('path:/run/custom/api.sock');
  });
});
