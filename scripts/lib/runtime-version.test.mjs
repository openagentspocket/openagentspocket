// Runs the real fingerprint over apps/mobile (about a second): the value must be a stable hash, and
// the store-build environment must be applied whatever the caller's shell says.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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

// An official build resolves its config with UPDATES_URL; the release and publish scripts never see
// it. The certificate's contents are not read here, so an empty file stands in for it.
test('the official-build updates flag does not change the runtime version', () => {
  const saved = { url: process.env.UPDATES_URL, cert: process.env.UPDATES_CERTIFICATE };
  const dir = mkdtempSync(join(tmpdir(), 'runtime-version-'));
  try {
    delete process.env.UPDATES_URL;
    delete process.env.UPDATES_CERTIFICATE;
    const plain = computeRuntimeVersion({ mobileDir, platform: 'ios' });
    writeFileSync(join(dir, 'cert.pem'), '');
    process.env.UPDATES_URL = 'http://127.0.0.1:8787/manifest';
    process.env.UPDATES_CERTIFICATE = join(dir, 'cert.pem');
    assert.equal(computeRuntimeVersion({ mobileDir, platform: 'ios' }), plain);
  } finally {
    for (const [name, value] of [
      ['UPDATES_URL', saved.url],
      ['UPDATES_CERTIFICATE', saved.cert],
    ]) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    rmSync(dir, { recursive: true, force: true });
  }
});
