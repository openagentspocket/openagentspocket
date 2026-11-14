// The real-bucket upload against a fake wrangler (publish/fake-wrangler.js): the commands it runs,
// their order, what it refuses, and that a failure never moves the channel pointer. No network.

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, beforeEach, test } from 'node:test';

import { readBundle } from '../publish/bundle.js';
import { createRollbackBundle, createUpdateBundle } from '../publish/create.js';
import { fakeWrangler } from '../publish/fake-wrangler.js';
import { readLog } from '../publish/log.js';
import { readExport } from '../publish/manifest.js';
import { runUpload } from '../publish/publish-upload.js';
import { loadCertificate, loadPrivateKey } from '../publish/signing.js';
import { memoryStore, r2Store } from '../publish/stores.js';
import { uploadBundle } from '../publish/upload.js';
import { createMemoryBucket } from '../src/memory-bucket.js';
import { storageKeys } from '../src/protocol.js';
import { createUpdatesServer } from '../src/worker.js';
import { BUILDS, makeExport, makeKeyPair, RUNTIME, tempDir } from './support.js';

const BASE = 'https://updates.example.com';
let dir;
let certificate;
let privateKey;
let exported;
let n = 0;
let scratch;
let logFile;

before(() => {
  dir = tempDir();
  mkdirSync(join(dir, 'repo'));
  const keys = makeKeyPair(dir);
  certificate = loadCertificate(keys.cert).certificate;
  privateKey = loadPrivateKey(keys.key, { repoRoot: join(dir, 'repo') });
  exported = readExport(makeExport(dir), 'ios');
});
after(() => rmSync(dir, { recursive: true, force: true }));
beforeEach(() => {
  n += 1;
  scratch = join(dir, `scratch-${n}`);
  mkdirSync(scratch);
  logFile = join(dir, `updates-${n}.jsonl`);
});

const common = () => ({
  platform: 'ios',
  runtimeVersion: RUNTIME,
  builds: BUILDS,
  log: [],
  commit: 'e'.repeat(40),
  privateKey,
  certificate,
});

async function makeUpdate(over = {}) {
  const outDir = join(dir, `update-${n}-${over.name ?? 'a'}`);
  await createUpdateBundle({
    ...common(),
    outDir,
    exported,
    baseUrl: BASE,
    expoClient: { name: 'Agents Pocket' },
    now: new Date('2026-11-14T10:00:00.000Z'),
    ...over,
  });
  return outDir;
}

const logged = (bundleDir, channel) => ({
  ...readBundle(bundleDir).entry,
  channel,
  uploadedAt: '2026-11-14T12:00:00.000Z',
});

function upload(bundleDir, wrangler, over = {}) {
  const lines = [];
  let made = 0;
  const run = runUpload({
    dir: bundleDir,
    channel: 'beta',
    target: 'r2',
    makeStore: () => {
      made += 1;
      return r2Store({ scratchDir: scratch, run: wrangler.run });
    },
    log: [],
    logFile,
    certificate,
    builds: BUILDS,
    print: (line) => lines.push(line),
    now: () => new Date('2026-11-14T13:00:00.000Z'),
    ...over,
  });
  return { run, lines, made: () => made };
}

test('writes assets, then body and signature, reads them back, and moves the pointer last', async () => {
  const bundleDir = await makeUpdate();
  const { entry, assets } = readBundle(bundleDir);
  const wrangler = fakeWrangler();
  const { run, lines } = upload(bundleDir, wrangler);
  await run;

  const writes = wrangler.writes();
  const pointer = storageKeys.pointer('ios', RUNTIME, 'beta');
  assert.deepEqual(
    writes.slice(0, assets.length).sort(),
    assets.map((a) => `put assets/${a.sha256}`).sort(),
  );
  assert.deepEqual(writes.slice(assets.length), [
    `put updates/${entry.id}/body`,
    `put updates/${entry.id}/signature`,
    `put ${pointer}`,
  ]);
  for (const call of wrangler.calls) {
    assert.ok(call.args.includes('--remote'), `${call.op} ${call.key} is remote`);
    assert.ok(!call.args.includes('--local'));
  }
  // Every written object is read back after the last write before the pointer.
  const pointerAt = wrangler.calls.findIndex((c) => c.op === 'put' && c.key === pointer);
  const readBacks = wrangler.calls.slice(0, pointerAt).filter((c) => c.op === 'get');
  for (const key of [`updates/${entry.id}/body`, ...assets.map((a) => `assets/${a.sha256}`)])
    assert.equal(
      readBacks.filter((c) => c.key === key).length,
      2,
      `${key}: checked absent, then read back`,
    );
  for (const a of assets)
    assert.equal(wrangler.objects.get(`assets/${a.sha256}`).contentType, a.contentType);
  assert.equal(wrangler.objects.get(`updates/${entry.id}/body`).contentType, 'application/json');

  const log = readLog(logFile);
  assert.deepEqual([log.length, log[0].id, log[0].channel], [1, entry.id, 'beta']);
  assert.ok(lines.some((l) => l.includes('git add docs/releases/updates.jsonl')));
  assert.ok(lines.some((l) => l.includes('git push origin main')));
});

test('an asset already present with the same bytes is skipped, not written again', async () => {
  const bundleDir = await makeUpdate();
  const { assets } = readBundle(bundleDir);
  const wrangler = fakeWrangler();
  const key = `assets/${assets[0].sha256}`;
  wrangler.objects.set(key, {
    bytes: new Uint8Array(readFileSync(readBundle(bundleDir).assetPath(assets[0].sha256))),
  });
  await upload(bundleDir, wrangler).run;
  assert.ok(!wrangler.writes().includes(`put ${key}`));
  assert.ok(wrangler.writes().includes(`put assets/${assets[1].sha256}`));
});

test('an asset present with other bytes stops the upload before the update and the pointer', async () => {
  const bundleDir = await makeUpdate();
  const { assets, entry } = readBundle(bundleDir);
  const wrangler = fakeWrangler();
  wrangler.objects.set(`assets/${assets[0].sha256}`, { bytes: new TextEncoder().encode('other') });
  await assert.rejects(upload(bundleDir, wrangler).run, /already exists with other bytes/);
  const writes = wrangler.writes();
  assert.ok(!writes.includes(`put assets/${assets[0].sha256}`), 'never overwritten');
  assert.ok(!writes.some((w) => w.includes(entry.id) || w.includes('channels/')));
  assert.equal(existsSync(logFile), false);
});

test('an existing updates/<id> with other bytes is never overwritten', async () => {
  const bundleDir = await makeUpdate();
  const { entry } = readBundle(bundleDir);
  const wrangler = fakeWrangler();
  wrangler.objects.set(storageKeys.body(entry.id), { bytes: new TextEncoder().encode('{}') });
  await assert.rejects(upload(bundleDir, wrangler).run, /already exists with other bytes/);
  assert.ok(!wrangler.writes().some((w) => w.includes(entry.id) || w.includes('channels/')));
});

test('a --local-test bundle never goes to r2, and nothing is touched', async () => {
  const bundleDir = await makeUpdate({ localTest: true });
  const wrangler = fakeWrangler();
  const attempt = upload(bundleDir, wrangler);
  await assert.rejects(attempt.run, /local-test bundle never goes to r2/);
  assert.deepEqual([attempt.made(), wrangler.calls.length], [0, 0]);
});

test('a bundle that fails verification is refused before any store exists', async () => {
  const bundleDir = await makeUpdate();
  const other = makeKeyPair(dir, 'other');
  const wrangler = fakeWrangler();
  const attempt = upload(bundleDir, wrangler, {
    certificate: loadCertificate(other.cert).certificate,
  });
  await assert.rejects(attempt.run, /failed verification/);
  assert.deepEqual([attempt.made(), wrangler.calls.length], [0, 0]);
});

test('a failed read-back leaves the pointer where it was', async () => {
  const bundleDir = await makeUpdate();
  const { entry } = readBundle(bundleDir);
  const pointer = storageKeys.pointer('ios', RUNTIME, 'beta');
  const wrangler = fakeWrangler({ corrupt: (key) => key === storageKeys.signature(entry.id) });
  await assert.rejects(
    upload(bundleDir, wrangler).run,
    /read-back: .*signature.*pointer was not moved/,
  );
  assert.ok(!wrangler.writes().includes(`put ${pointer}`));
  assert.equal(wrangler.objects.has(pointer), false);
  assert.equal(existsSync(logFile), false, 'nothing logged');
});

test('a wrangler error that is not "missing" (auth, network) stops before anything is written', async () => {
  const bundleDir = await makeUpdate();
  const wrangler = fakeWrangler({ fail: () => '✘ [ERROR] Authentication error [code: 10000]' });
  await assert.rejects(upload(bundleDir, wrangler).run, /Authentication error/);
  assert.deepEqual(wrangler.writes(), []);
});

test('production needs the update on beta first, or an explicit --skip-beta', async () => {
  const bundleDir = await makeUpdate();
  const first = fakeWrangler();
  const refused = upload(bundleDir, first, { channel: 'production' });
  await assert.rejects(refused.run, /never on beta.*--skip-beta/);
  assert.deepEqual([refused.made(), first.calls.length], [0, 0]);

  const afterBeta = fakeWrangler();
  await upload(bundleDir, afterBeta, { channel: 'production', log: [logged(bundleDir, 'beta')] })
    .run;
  assert.ok(
    afterBeta.writes().includes(`put ${storageKeys.pointer('ios', RUNTIME, 'production')}`),
  );

  n += 1;
  logFile = join(dir, `updates-${n}.jsonl`);
  const rollbackDir = join(dir, `rollback-${n}`);
  await createRollbackBundle({
    ...common(),
    outDir: rollbackDir,
    now: new Date('2026-11-14T11:00:00.000Z'),
  });
  const skipped = fakeWrangler();
  await upload(rollbackDir, skipped, { channel: 'production', skipBeta: true }).run;
  assert.equal(readLog(logFile)[0].channel, 'production');
});

test('a bucket the public log disagrees with is refused before anything is written', async () => {
  const bundleDir = await makeUpdate();
  const wrangler = fakeWrangler();
  const pointer = storageKeys.pointer('ios', RUNTIME, 'beta');
  const unlogged = '{"kind":"manifest","id":"00000000-0000-4000-8000-000000000000"}';
  wrangler.objects.set(pointer, { bytes: new TextEncoder().encode(unlogged) });
  await assert.rejects(upload(bundleDir, wrangler).run, /public log says nothing/);
  assert.deepEqual(wrangler.writes(), []);
});

test('a dry run prints every object and the pointer change, and touches nothing', async () => {
  const bundleDir = await makeUpdate();
  const { entry, assets } = readBundle(bundleDir);
  const wrangler = fakeWrangler();
  const attempt = upload(bundleDir, wrangler, { dryRun: true, baseUrl: BASE });
  await attempt.run;
  assert.deepEqual([attempt.made(), wrangler.calls.length], [0, 0]);
  assert.equal(existsSync(logFile), false);
  const out = attempt.lines.join('\n');
  for (const a of assets) assert.match(out, new RegExp(`assets/${a.sha256}`));
  assert.match(out, new RegExp(`updates/${entry.id}/body`));
  assert.match(out, new RegExp(`updates/${entry.id}/signature`));
  assert.match(
    out,
    new RegExp(`channels/ios/${RUNTIME}/beta: nothing published -> manifest ${entry.id}`),
  );
});

test('asset URLs for another server are refused when --base-url is given', async () => {
  const bundleDir = await makeUpdate();
  const wrangler = fakeWrangler();
  const attempt = upload(bundleDir, wrangler, { baseUrl: 'https://other.example.com' });
  await assert.rejects(attempt.run, /built for another server/);
  assert.equal(wrangler.calls.length, 0);
});

// With --base-url, assets are read back through the Worker and the moved pointer is checked as the
// app would; here the Worker serves the same in-memory bucket the store writes.
function workerFetch(bucket, { breakManifest = false } = {}) {
  const server = createUpdatesServer();
  return async (url, init) => {
    const res = await server.fetch(new Request(url, init), { UPDATES: bucket });
    if (breakManifest && String(url).endsWith('/manifest'))
      return new Response(null, { status: 500 });
    return res;
  };
}

test('with --base-url the deployed Worker is checked; the update is served and logged', async () => {
  const bundleDir = await makeUpdate();
  const bucket = createMemoryBucket();
  const lines = [];
  await runUpload({
    dir: bundleDir,
    channel: 'beta',
    target: 'r2',
    makeStore: () => memoryStore(bucket),
    log: [],
    logFile,
    certificate,
    builds: BUILDS,
    baseUrl: BASE,
    fetchImpl: workerFetch(bucket),
    print: (line) => lines.push(line),
  });
  assert.ok(lines.some((l) => l.includes('passes the app')));
  assert.equal(readLog(logFile).length, 1);
});

test('a failed check after the pointer moved puts the previous pointer back', async () => {
  const bucket = createMemoryBucket();
  const pointer = storageKeys.pointer('ios', RUNTIME, 'beta');
  const previous = '{"kind":"manifest","id":"00000000-0000-4000-8000-000000000000"}';
  await bucket.put(pointer, previous);
  const bundleDir = await makeUpdate();
  await assert.rejects(
    uploadBundle(readBundle(bundleDir), {
      channel: 'beta',
      store: memoryStore(bucket),
      afterPointer: async () => ['the server answered 500'],
    }),
    /put back to its previous value/,
  );
  assert.equal(await (await bucket.get(pointer)).text(), previous);

  const fresh = createMemoryBucket();
  await assert.rejects(
    runUpload({
      dir: bundleDir,
      channel: 'beta',
      target: 'r2',
      makeStore: () => memoryStore(fresh),
      log: [],
      logFile,
      certificate,
      builds: BUILDS,
      baseUrl: BASE,
      fetchImpl: workerFetch(fresh, { breakManifest: true }),
      print: () => {},
    }),
    /put back to nothing/,
  );
  assert.equal(await fresh.get(pointer), null);
  assert.equal(existsSync(logFile), false);
});
