// Runs the real fingerprint over apps/mobile (about a second): the value must be a stable hash, and
// the store-build environment must be applied whatever the caller's shell says.
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';

import { computeRuntimeVersion } from './runtime-version.mjs';

const mobileDir = join(import.meta.dirname, '..', '..', 'apps', 'mobile');

test('the runtime version is a fingerprint hash, the same in any shell environment', () => {
  const before = process.env.APNS_ENVIRONMENT;
  try {
    process.env.APNS_ENVIRONMENT = 'development';
    const a = computeRuntimeVersion({ mobileDir, platform: 'ios' });
    delete process.env.APNS_ENVIRONMENT;
    const b = computeRuntimeVersion({ mobileDir, platform: 'ios' });
    assert.match(a, /^[0-9a-f]{40}$/);
    assert.equal(a, b);
  } finally {
    if (before === undefined) delete process.env.APNS_ENVIRONMENT;
    else process.env.APNS_ENVIRONMENT = before;
  }
});
