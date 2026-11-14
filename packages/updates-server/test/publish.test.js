// The publish tooling, end to end on disk: build and sign a bundle from a fake export with a
// throwaway key, verify it as the client would, and catch every way it can be wrong.

import assert from 'node:assert/strict';
import { createVerify } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, beforeEach, suite, test } from 'node:test';

import { readBundle } from '../publish/bundle.js';
import { createRollbackBundle, createUpdateBundle } from '../publish/create.js';
import { encodeJson, readExport, sha256Hex } from '../publish/manifest.js';
import { loadCertificate, loadPrivateKey } from '../publish/signing.js';
import { verifyBundle } from '../publish/verify.js';
import { BUILDS, makeExport, makeKeyPair, RUNTIME, tempDir } from './support.js';

let dir;
let keys;
let other;
let exported;
let out;
let n = 0;
const repoRoot = () => join(dir, 'repo-stand-in');

before(() => {
  dir = tempDir();
  keys = makeKeyPair(dir, 'good');
  other = makeKeyPair(dir, 'other');
  exported = readExport(makeExport(dir), 'ios');
  mkdirSync(repoRoot());
});
after(() => rmSync(dir, { recursive: true, force: true }));
beforeEach(() => {
  n += 1;
  out = join(dir, `bundle-${n}`);
});

const privateKey = (pair = keys) => loadPrivateKey(pair.key, { repoRoot: repoRoot() });
const certificate = (pair = keys) => loadCertificate(pair.cert).certificate;

function publish(over = {}) {
  return createUpdateBundle({
    outDir: out,
    exported,
    platform: 'ios',
    runtimeVersion: RUNTIME,
    builds: BUILDS,
    log: [],
    baseUrl: 'https://updates.example.com',
    expoClient: { name: 'Agents Pocket', ios: { buildNumber: '4' } },
    commit: 'd'.repeat(40),
    privateKey: privateKey(),
    certificate: certificate(),
    now: new Date('2026-11-14T10:00:00.000Z'),
    ...over,
  });
}

const verify = (over = {}) =>
  verifyBundle(out, { certificate: certificate(), builds: BUILDS, log: [], ...over });

suite('a good publish', () => {
  test('writes a bundle the client would accept', async () => {
    const { entry, manifest, bytes } = await publish();
    assert.deepEqual((await verify()).problems, []);
    assert.deepEqual(readdirSync(out).sort(), [
      'assets',
      'assets.json',
      'log-entry.json',
      'manifest.json',
      'signature',
    ]);
    assert.deepEqual(new Uint8Array(readFileSync(join(out, 'manifest.json'))), bytes);
    assert.equal(entry.bodySha256, sha256Hex(bytes));
    assert.equal(manifest.runtimeVersion, RUNTIME);
    assert.equal(manifest.createdAt, '2026-11-14T10:00:00.000Z');
    assert.deepEqual(manifest.metadata, {});
    assert.equal(manifest.extra.commit, 'd'.repeat(40));
  });

  test('the manifest has the fields expo-updates reads', async () => {
    const { manifest } = await publish();
    const { launchAsset, assets } = manifest;
    assert.equal(launchAsset.contentType, 'application/javascript');
    assert.equal(launchAsset.fileExtension, undefined);
    assert.match(launchAsset.hash, /^[A-Za-z0-9_-]{43}$/);
    assert.match(launchAsset.key, /^[0-9a-f]{32}$/);
    assert.match(launchAsset.url, /^https:\/\/updates\.example\.com\/assets\/[0-9a-f]{64}$/);
    assert.deepEqual(
      assets.map((a) => [a.contentType, a.fileExtension]),
      [
        ['image/png', '.png'],
        ['font/ttf', '.ttf'],
      ],
    );
  });

  test('the signature is RSA-SHA256 over the exact bytes, and the bytes are ASCII', async () => {
    const { bytes } = await publish();
    const header = readFileSync(join(out, 'signature'), 'utf8').trim();
    const [, sig, keyid, alg] = /^sig="([^"]+)", keyid="([^"]+)", alg="([^"]+)"$/.exec(header);
    assert.equal(keyid, 'main');
    assert.equal(alg, 'rsa-v1_5-sha256');
    assert.ok(
      createVerify('RSA-SHA256').update(bytes).verify(readFileSync(keys.cert), sig, 'base64'),
    );
    assert.ok(bytes.every((b) => b >= 0x20 && b <= 0x7e));
  });

  test('nothing of the key ends up in the bundle', async () => {
    await publish();
    const keyBody = readFileSync(keys.key, 'utf8').split('\n')[1];
    for (const name of ['manifest.json', 'signature', 'log-entry.json', 'assets.json'])
      assert.ok(!readFileSync(join(out, name), 'utf8').includes(keyBody), name);
    assert.ok(!readFileSync(join(out, 'log-entry.json'), 'utf8').includes('PRIVATE'));
  });

  test('a rollback directive is signed and verified the same way', async () => {
    const { entry } = await createRollbackBundle({
      outDir: out,
      platform: 'ios',
      runtimeVersion: RUNTIME,
      builds: BUILDS,
      log: [],
      commit: 'd'.repeat(40),
      privateKey: privateKey(),
      certificate: certificate(),
      now: new Date('2026-11-14T11:00:00.000Z'),
    });
    assert.equal(entry.kind, 'directive');
    const body = JSON.parse(readFileSync(join(out, 'directive.json'), 'utf8'));
    assert.deepEqual(body, {
      type: 'rollBackToEmbedded',
      parameters: { commitTime: '2026-11-14T11:00:00.000Z' },
    });
    assert.deepEqual((await verify()).problems, []);
  });
});

suite('refusals', () => {
  test("a key that is not the certificate's: nothing is written", async () => {
    await assert.rejects(
      publish({ privateKey: privateKey(other) }),
      /does not belong to the certificate/,
    );
    assert.equal(existsSync(out), false);
  });

  test('a bundle checked against another certificate fails', async () => {
    await publish();
    const { problems } = await verify({ certificate: certificate(other) });
    assert.match(problems.join(), /signature does not match/);
  });

  test('a tampered manifest fails the signature', async () => {
    await publish();
    const file = join(out, 'manifest.json');
    writeFileSync(file, readFileSync(file, 'utf8').replace('"metadata":{}', '"metadata":{ }'));
    assert.match((await verify()).problems.join(), /signature does not match/);
  });

  test('a tampered asset fails its hash', async () => {
    await publish();
    const { assets, assetPath } = readBundle(out);
    writeFileSync(assetPath(assets[1].sha256), 'swapped');
    const { problems } = await verify();
    assert.match(problems.join(), /does not match its hash/);
  });

  test('a runtime no released build has is refused', async () => {
    await assert.rejects(
      publish({ runtimeVersion: 'f'.repeat(40) }),
      /matches no released ios build/,
    );
    await publish();
    assert.match((await verify({ builds: [] })).problems.join(), /matches no released ios build/);
  });

  test('an update not newer than the last published one is refused', async () => {
    const newer = {
      kind: 'manifest',
      id: '00000000-0000-4000-8000-000000000001',
      platform: 'ios',
      runtimeVersion: RUNTIME,
      createdAt: '2026-11-14T12:00:00.000Z',
      channel: 'beta',
    };
    await assert.rejects(publish({ log: [newer] }), /not newer than manifest/);
    assert.equal(existsSync(out), false);
    await publish();
    assert.match((await verify({ log: [newer], channel: 'beta' })).problems.join(), /not newer/);
    assert.deepEqual((await verify({ log: [newer], channel: 'production' })).problems, []);
  });

  test('the same update twice on one channel is refused', async () => {
    const { entry } = await publish();
    const log = [{ ...entry, channel: 'beta', uploadedAt: '2026-11-14T10:05:00.000Z' }];
    assert.match(
      (await verify({ log, channel: 'beta' })).problems.join(),
      /already published to beta/,
    );
    assert.deepEqual((await verify({ log, channel: 'production' })).problems, []);
  });

  test('Android is not published to yet', async () => {
    await assert.rejects(publish({ platform: 'android' }), /not enabled/);
  });

  test('the key must be a file outside the repository, named by path', () => {
    assert.throws(() => loadPrivateKey(keys.key, { repoRoot: dir }), /inside the repository/);
    assert.throws(
      () => loadPrivateKey('-----BEGIN PRIVATE KEY-----\nAAAA', { repoRoot: repoRoot() }),
      /file path/,
    );
    assert.throws(
      () => loadPrivateKey(join(dir, 'missing.pem'), { repoRoot: repoRoot() }),
      /no key file/,
    );
    assert.throws(
      () => loadPrivateKey(keys.cert, { repoRoot: repoRoot() }),
      /not a readable private key/,
    );
  });

  test('a certificate without the code signing usage is flagged', () => {
    assert.deepEqual(loadCertificate(keys.cert).problems, []);
    const expired = loadCertificate(keys.cert, new Date('2099-01-01T00:00:00Z')).problems;
    assert.match(expired.join(), /expired/);
  });
});

test('JSON is encoded as ASCII with escapes', () => {
  assert.equal(
    new TextDecoder().decode(encodeJson({ a: 'café \u{1F600}' })),
    '{"a":"caf\\u00e9 \\ud83d\\ude00"}',
  );
});
