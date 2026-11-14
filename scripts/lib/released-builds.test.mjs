import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';

import {
  appendBuild,
  buildsForRuntime,
  bundleUpdatesReport,
  embeddedRuntimeProblem,
  embeddedUpdatesProblems,
  officialUpdatesUrl,
  readBuilds,
} from './released-builds.mjs';

let dir;
let file;
const entry = (over = {}) => ({
  platform: 'ios',
  version: '1.0.2',
  build: '4',
  runtimeVersion: 'a'.repeat(40),
  commit: 'c'.repeat(40),
  archivedAt: '2026-11-14T12:00:00.000Z',
  ...over,
});

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'builds-'));
  file = join(dir, 'builds.json');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test('a missing file is no builds', () => {
  assert.deepEqual(readBuilds(file), []);
});

test('appends builds in order and keeps only the known fields', () => {
  appendBuild(file, { ...entry(), extra: 'dropped' });
  appendBuild(file, entry({ build: '5', runtimeVersion: 'b'.repeat(40) }));
  const builds = readBuilds(file);
  assert.deepEqual(
    builds.map((b) => b.build),
    ['4', '5'],
  );
  assert.equal('extra' in builds[0], false);
  assert.ok(readFileSync(file, 'utf8').endsWith(']\n'));
});

test('refuses the same build twice and incomplete entries', () => {
  appendBuild(file, entry());
  assert.throws(() => appendBuild(file, entry()), /already recorded/);
  assert.throws(() => appendBuild(file, entry({ runtimeVersion: '' })), /lacks runtimeVersion/);
});

test('finds the builds an update for a runtime can reach', () => {
  appendBuild(file, entry());
  appendBuild(file, entry({ build: '5' }));
  appendBuild(file, entry({ build: '6', runtimeVersion: 'b'.repeat(40) }));
  const builds = readBuilds(file);
  assert.deepEqual(
    buildsForRuntime(builds, 'ios', 'a'.repeat(40)).map((b) => b.build),
    ['4', '5'],
  );
  assert.deepEqual(buildsForRuntime(builds, 'android', 'a'.repeat(40)), []);
});

test('the runtime a build embeds must be the recorded one', () => {
  const app = join(dir, 'App.app');
  assert.match(embeddedRuntimeProblem(app, 'a'.repeat(40)), /embeds no runtime/);
  mkdirSync(join(app, 'EXUpdates.bundle'), { recursive: true });
  writeFileSync(join(app, 'EXUpdates.bundle', 'fingerprint'), 'a'.repeat(40));
  assert.equal(embeddedRuntimeProblem(app, 'a'.repeat(40)), null);
  assert.match(embeddedRuntimeProblem(app, 'b'.repeat(40)), /embeds runtime a+/);
});

test('the official-build flag comes from the environment first, then app.local.json', () => {
  assert.equal(officialUpdatesUrl({}, {}), null);
  assert.equal(officialUpdatesUrl({}, { updatesUrl: 'https://a.test/m' }), 'https://a.test/m');
  assert.equal(
    officialUpdatesUrl({ UPDATES_URL: 'https://b.test/m' }, { updatesUrl: 'https://a.test/m' }),
    'https://b.test/m',
  );
});

test('a store build embeds updates disabled without the flag, enabled and signed with it', () => {
  const url = 'https://updates.example.test/manifest';
  const signed = {
    EXUpdatesEnabled: true,
    EXUpdatesURL: url,
    EXUpdatesCodeSigningCertificate: '-----BEGIN CERTIFICATE-----\nx\n-----END CERTIFICATE-----',
    EXUpdatesCodeSigningMetadata: { keyid: 'main', alg: 'rsa-v1_5-sha256' },
    EXUpdatesRuntimeVersion: 'file:fingerprint',
  };
  assert.deepEqual(embeddedUpdatesProblems({ EXUpdatesEnabled: false }, null), []);
  assert.equal(embeddedUpdatesProblems(signed, null).length, 1);
  assert.deepEqual(embeddedUpdatesProblems(signed, url), []);
  const unsigned = { ...signed, EXUpdatesCodeSigningCertificate: undefined };
  assert.match(embeddedUpdatesProblems(unsigned, url).join(), /unsigned/);
  assert.match(embeddedUpdatesProblems(signed, 'https://other.test/m').join(), /expected/);
  assert.match(embeddedUpdatesProblems({ EXUpdatesEnabled: false }, url).join(), /not enabled/);
});

test('a built app reports its runtime and updates state in one place', () => {
  const app = join(dir, 'Report.app');
  mkdirSync(join(app, 'EXUpdates.bundle'), { recursive: true });
  writeFileSync(join(app, 'EXUpdates.bundle', 'fingerprint'), 'a'.repeat(40));
  const plist = () => ({ EXUpdatesEnabled: false });
  const off = bundleUpdatesReport(app, { runtimeVersion: 'a'.repeat(40), url: null, plist });
  assert.deepEqual(off.problems, []);
  assert.match(off.summary, /updates off/);
  const url = 'https://a.test/m';
  const wrong = bundleUpdatesReport(app, { runtimeVersion: 'b'.repeat(40), url, plist });
  assert.match(wrong.problems.join(), /embeds runtime a+.*not enabled/);
});
