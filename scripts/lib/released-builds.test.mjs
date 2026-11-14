import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';

import {
  appendBuild,
  buildsForRuntime,
  embeddedRuntimeProblem,
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
  assert.equal(embeddedRuntimeProblem(app, 'a'.repeat(40)), null);
  mkdirSync(join(app, 'EXUpdates.bundle'), { recursive: true });
  writeFileSync(join(app, 'EXUpdates.bundle', 'fingerprint'), 'a'.repeat(40));
  assert.equal(embeddedRuntimeProblem(app, 'a'.repeat(40)), null);
  assert.match(embeddedRuntimeProblem(app, 'b'.repeat(40)), /embeds runtime a+/);
});
