// Publish, upload and fetch, all in process: a signed bundle goes into the in-memory bucket through
// the same uploader the local and real stores implement, the Worker serves it, and verifyRemote
// checks it as the app would (signature, runtime, every asset over HTTP, the public log).

import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

import { readBundle } from '../publish/bundle.js';
import { createRollbackBundle, createUpdateBundle } from '../publish/create.js';
import { readExport } from '../publish/manifest.js';
import { loadCertificate, loadPrivateKey } from '../publish/signing.js';
import { memoryStore, r2Store, uploadBundle } from '../publish/upload.js';
import { verifyRemote } from '../publish/verify.js';
import { createMemoryBucket } from '../src/memory-bucket.js';
import { createUpdatesServer } from '../src/worker.js';
import { BUILDS, makeExport, makeKeyPair, RUNTIME, tempDir } from './support.js';

const BASE = 'https://updates.example.com';
let dir;
let common;
let certificate;

before(() => {
  dir = tempDir();
  mkdirSync(join(dir, 'repo'));
  const keys = makeKeyPair(dir);
  certificate = loadCertificate(keys.cert).certificate;
  common = {
    platform: 'ios',
    runtimeVersion: RUNTIME,
    builds: BUILDS,
    log: [],
    commit: 'e'.repeat(40),
    privateKey: loadPrivateKey(keys.key, { repoRoot: join(dir, 'repo') }),
    certificate,
  };
});
after(() => rmSync(dir, { recursive: true, force: true }));

function serverFetch(bucket) {
  const server = createUpdatesServer();
  return (url, init) => server.fetch(new Request(url, init), { UPDATES: bucket });
}

const logEntry = (bundleDir, channel) => ({
  ...readBundle(bundleDir).entry,
  channel,
  uploadedAt: '2026-11-14T12:00:00.000Z',
});

test('an uploaded update is served and passes the client checks; other channels get nothing', async () => {
  const bucket = createMemoryBucket();
  const outDir = join(dir, 'update');
  await createUpdateBundle({
    ...common,
    outDir,
    exported: readExport(makeExport(dir), 'ios'),
    baseUrl: BASE,
    expoClient: { name: 'Agents Pocket' },
    now: new Date('2026-11-14T10:00:00.000Z'),
  });
  const keys = [];
  const store = memoryStore(bucket);
  const recording = {
    ...store,
    put: (key, ...rest) => {
      keys.push(key);
      return store.put(key, ...rest);
    },
  };
  await uploadBundle(readBundle(outDir), { channel: 'beta', store: recording });
  assert.match(keys.at(-1), /^channels\/ios\/[0-9a-f]+\/beta$/, 'the pointer is written last');

  const ask = (channel, log) =>
    verifyRemote({
      manifestUrl: `${BASE}/manifest`,
      platform: 'ios',
      runtimeVersion: RUNTIME,
      channel,
      certificate,
      builds: BUILDS,
      log,
      fetchImpl: serverFetch(bucket),
    });

  const beta = await ask('beta', [logEntry(outDir, 'beta')]);
  assert.deepEqual(beta.problems, []);
  assert.deepEqual([beta.served.kind, beta.served.logged], ['manifest', true]);

  const unlogged = await ask('beta', []);
  assert.match(unlogged.problems.join(), /not in the public log/);

  const production = await ask('production', []);
  assert.deepEqual(production, { problems: [], served: null });
});

test('a rollback directive goes through the same path', async () => {
  const bucket = createMemoryBucket();
  const outDir = join(dir, 'rollback');
  await createRollbackBundle({ ...common, outDir, now: new Date('2026-11-14T11:00:00.000Z') });
  await uploadBundle(readBundle(outDir), { channel: 'production', store: memoryStore(bucket) });
  const result = await verifyRemote({
    manifestUrl: `${BASE}/manifest`,
    platform: 'ios',
    runtimeVersion: RUNTIME,
    channel: 'production',
    certificate,
    builds: BUILDS,
    log: [logEntry(outDir, 'production')],
    fetchImpl: serverFetch(bucket),
  });
  assert.deepEqual(result.problems, []);
  assert.equal(result.served.kind, 'directive');
});

test('the real R2 store is an owner step: it refuses before writing anything', async () => {
  const outDir = join(dir, 'unsent');
  await createRollbackBundle({ ...common, outDir, now: new Date('2026-11-14T12:00:00.000Z') });
  await assert.rejects(
    uploadBundle(readBundle(outDir), { channel: 'beta', store: r2Store() }),
    /owner step/,
  );
});
