import { describe, expect, it } from 'vitest';
import sessions from '../../../plugin/test-vectors/notification-session-v1.json';
import { utf8Length } from './bytes';
import {
  herdrEndpoint,
  herdrSessionFromSocketPath,
  isValidHerdrSessionName,
  MAXIMUM_SOCKET_PATH_UTF8_LENGTH,
} from './endpoint';

// The session rules a v2 Pairing Code's `sock` must satisfy, pinned by the
// vectors the plugin and the Swift app share.
describe('herdr session vectors', () => {
  it('loads non-empty vector lists', () => {
    expect(sessions.names.length).toBeGreaterThanOrEqual(10);
    expect(sessions.derivation.length).toBeGreaterThanOrEqual(10);
  });

  it.each(sessions.names.map((v) => [v.name, v.valid] as const))(
    'name %j is valid: %s',
    (name, valid) => {
      expect(isValidHerdrSessionName(name)).toBe(valid);
    },
  );

  it.each(sessions.derivation.map((v) => [v.name, v] as const))('derives: %s', (_, vector) => {
    expect(herdrSessionFromSocketPath(vector.socketPath)).toBe(vector.session);
  });

  it('accepts as an endpoint socket only a path with a known session', () => {
    for (const vector of sessions.derivation) {
      const path = vector.socketPath;
      if (!path?.startsWith('/')) continue;
      const accepted = herdrEndpoint(path, '/usr/local/bin/herdr') !== null;
      const fits = utf8Length(path) <= MAXIMUM_SOCKET_PATH_UTF8_LENGTH;
      expect(accepted, vector.name).toBe(vector.session !== null && fits);
    }
  });
});
