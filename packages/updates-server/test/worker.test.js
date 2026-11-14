// Boundary tests for the update server: Request in, Response out, against an in-memory bucket with
// the same shapes as R2. Protocol rules: https://docs.expo.dev/technical-specs/expo-updates-1/

import assert from 'node:assert/strict';
import { afterEach, beforeEach, suite, test } from 'node:test';

import { createMemoryBucket } from '../src/memory-bucket.js';
import { parseMultipart, partName, storageKeys } from '../src/protocol.js';
import { createUpdatesServer } from '../src/worker.js';

const RUNTIME = '33b4fd11e404248c9e547c24307f3114b342e1b3';
const ID_BETA = '0f6c5b0e-1111-4c5e-9d55-2b1f3e0a0001';
const ID_PROD = '0f6c5b0e-2222-4c5e-9d55-2b1f3e0a0002';
const ID_DIRECTIVE = '0f6c5b0e-3333-4c5e-9d55-2b1f3e0a0003';
const ASSET = 'a'.repeat(64);
// Non-ASCII on purpose: the bytes must come back exactly, not re-encoded.
const MANIFEST_PROD = '{"id":"prod","note":"café \\u00e9"}';
const MANIFEST_BETA = '{"id":"beta"}';
const DIRECTIVE =
  '{"type":"rollBackToEmbedded","parameters":{"commitTime":"2026-11-14T00:00:00.000Z"}}';
const SIG_PROD = 'sig="cHJvZA==", keyid="main", alg="rsa-v1_5-sha256"';
const SIG_BETA = 'sig="YmV0YQ==", keyid="main", alg="rsa-v1_5-sha256"';
const SIG_DIRECTIVE = 'sig="ZGly", keyid="main", alg="rsa-v1_5-sha256"';

let bucket;
let env;
const server = createUpdatesServer();

async function publish(platform, channel, kind, id, body, signature) {
  await bucket.put(storageKeys.body(id), body);
  await bucket.put(storageKeys.signature(id), `${signature}\n`);
  await bucket.put(storageKeys.pointer(platform, RUNTIME, channel), JSON.stringify({ kind, id }));
}

beforeEach(async () => {
  bucket = createMemoryBucket();
  env = { UPDATES: bucket };
  await publish('ios', 'production', 'manifest', ID_PROD, MANIFEST_PROD, SIG_PROD);
  await publish('ios', 'beta', 'manifest', ID_BETA, MANIFEST_BETA, SIG_BETA);
  await bucket.put(storageKeys.asset(ASSET), new Uint8Array([1, 2, 3, 4]), {
    httpMetadata: { contentType: 'image/png' },
  });
});

const clientHeaders = (overrides = {}) => ({
  accept: 'multipart/mixed,application/expo+json,application/json',
  'expo-platform': 'ios',
  'expo-protocol-version': '1',
  'expo-api-version': '1',
  'expo-updates-environment': 'BARE',
  'expo-runtime-version': RUNTIME,
  'expo-expect-signature': 'sig, keyid="main", alg="rsa-v1_5-sha256"',
  'eas-client-id': '5B1F2C3D-0000-4000-8000-000000000000',
  'expo-fatal-error': 'TypeError: host build.example.internal said no',
  ...overrides,
});

function get(path, headers = clientHeaders(), method = 'GET') {
  const clean = Object.fromEntries(Object.entries(headers).filter(([, v]) => v !== undefined));
  return server.fetch(
    new Request(`https://updates.example${path}`, { method, headers: clean }),
    env,
  );
}

async function parts(response) {
  const boundary = /boundary=([^;]+)/.exec(response.headers.get('content-type'))[1];
  return parseMultipart(new Uint8Array(await response.arrayBuffer()), boundary);
}

suite('manifest response', () => {
  test('carries the protocol headers and a multipart/mixed body', async () => {
    const res = await get('/manifest');
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('expo-protocol-version'), '1');
    assert.equal(res.headers.get('expo-sfv-version'), '0');
    assert.equal(res.headers.get('cache-control'), 'private, max-age=0');
    assert.match(res.headers.get('content-type'), /^multipart\/mixed; boundary=[\w-]+$/);
    // No filters: a server-sent filter could let an older update past the client's createdAt
    // check (ADR 0028, Rollout), so none is ever sent.
    assert.equal(res.headers.get('expo-manifest-filters'), null);
    assert.equal(res.headers.get('expo-server-defined-headers'), null);
  });

  test('has one manifest part with the stored signature and the stored bytes, unchanged', async () => {
    const list = await parts(await get('/manifest'));
    assert.equal(list.length, 1);
    const [part] = list;
    assert.equal(partName(part.headers), 'manifest');
    assert.equal(part.headers['content-disposition'], 'form-data; name="manifest"');
    assert.equal(part.headers['content-type'], 'application/json');
    assert.equal(part.headers['expo-signature'], SIG_PROD);
    assert.deepEqual(part.body, new TextEncoder().encode(MANIFEST_PROD));
  });

  test('picks by channel from Expo-Extra-Params, production when absent', async () => {
    const beta = await parts(
      await get('/manifest', clientHeaders({ 'expo-extra-params': 'channel="beta"' })),
    );
    assert.equal(new TextDecoder().decode(beta[0].body), MANIFEST_BETA);
    assert.equal(beta[0].headers['expo-signature'], SIG_BETA);
    const other = await parts(
      await get(
        '/manifest',
        clientHeaders({ 'expo-extra-params': 'other="x", channel="production"' }),
      ),
    );
    assert.equal(new TextDecoder().decode(other[0].body), MANIFEST_PROD);
  });

  test('picks by platform and runtime version', async () => {
    const android = await get('/manifest', clientHeaders({ 'expo-platform': 'android' }));
    assert.equal(android.status, 204);
    const unknown = await get(
      '/manifest',
      clientHeaders({ 'expo-runtime-version': 'f'.repeat(40) }),
    );
    assert.equal(unknown.status, 204);
  });

  test('no update is a 204 with the protocol headers and no body or content-type', async () => {
    const res = await get('/manifest', clientHeaders({ 'expo-runtime-version': '1.0.0' }));
    assert.equal(res.status, 204);
    assert.equal(res.headers.get('expo-protocol-version'), '1');
    assert.equal(res.headers.get('content-type'), null);
    assert.equal((await res.arrayBuffer()).byteLength, 0);
  });

  test('answers 204 to a device that already runs the published update', async () => {
    const res = await get('/manifest', clientHeaders({ 'expo-current-update-id': ID_PROD }));
    assert.equal(res.status, 204);
  });

  test('serves a stored directive as a directive part, signature included', async () => {
    await publish('ios', 'production', 'directive', ID_DIRECTIVE, DIRECTIVE, SIG_DIRECTIVE);
    const [part] = await parts(
      await get('/manifest', clientHeaders({ 'expo-current-update-id': ID_PROD })),
    );
    assert.equal(partName(part.headers), 'directive');
    assert.equal(part.headers['expo-signature'], SIG_DIRECTIVE);
    assert.equal(new TextDecoder().decode(part.body), DIRECTIVE);
  });

  test('refuses what the protocol says to refuse', async () => {
    const cases = [
      [{ 'expo-protocol-version': undefined }, 406],
      [{ 'expo-protocol-version': '0' }, 406],
      [{ accept: 'application/expo+json' }, 406],
      [{ accept: 'multipart/mixed;q=0, application/json' }, 406],
      [{ 'expo-platform': 'web' }, 400],
      [{ 'expo-platform': undefined }, 400],
      [{ 'expo-runtime-version': undefined }, 400],
      [{ 'expo-runtime-version': '../channels/ios' }, 400],
      [{ 'expo-extra-params': 'channel="staging"' }, 400],
      [{ 'expo-extra-params': 'channel=' }, 400],
    ];
    for (const [overrides, status] of cases) {
      const res = await get('/manifest', clientHeaders(overrides));
      assert.equal(res.status, status, JSON.stringify(overrides));
    }
  });

  test('accepts a missing Accept header and a wildcard', async () => {
    assert.equal((await get('/manifest', clientHeaders({ accept: undefined }))).status, 200);
    assert.equal((await get('/manifest', clientHeaders({ accept: '*/*' }))).status, 200);
  });

  test('a half-published update (pointer without body) is a 500, never a partial answer', async () => {
    await bucket.put(
      storageKeys.pointer('ios', RUNTIME, 'production'),
      JSON.stringify({ kind: 'manifest', id: ID_DIRECTIVE }),
    );
    assert.equal((await get('/manifest')).status, 500);
  });
});

suite('assets', () => {
  test('serves stored bytes with their content type and an immutable cache header', async () => {
    const res = await get(`/assets/${ASSET}`, {});
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/png');
    assert.equal(res.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    assert.equal(res.headers.get('content-length'), '4');
    assert.deepEqual(new Uint8Array(await res.arrayBuffer()), new Uint8Array([1, 2, 3, 4]));
  });

  test('HEAD answers the headers without a body', async () => {
    const res = await get(`/assets/${ASSET}`, {}, 'HEAD');
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-length'), '4');
  });

  test('unknown or malformed asset ids are 404', async () => {
    assert.equal((await get(`/assets/${'b'.repeat(64)}`, {})).status, 404);
    assert.equal((await get('/assets/..%2Fchannels', {})).status, 404);
    assert.equal((await get(`/assets/${ASSET.toUpperCase()}`, {})).status, 404);
  });
});

suite('routing', () => {
  test('wrong methods are 405 with Allow, unknown paths 404', async () => {
    const post = await get('/manifest', clientHeaders(), 'POST');
    assert.equal(post.status, 405);
    assert.equal(post.headers.get('allow'), 'GET');
    const put = await get(`/assets/${ASSET}`, {}, 'PUT');
    assert.equal(put.status, 405);
    assert.equal(put.headers.get('allow'), 'GET, HEAD');
    for (const path of [
      '/',
      '/manifest/',
      '/log',
      '/assets',
      `/assets/${ASSET}/x`,
      '/channels/ios',
    ])
      assert.equal((await get(path)).status, 404, path);
  });

  test('a missing bucket binding is a 500', async () => {
    env = {};
    assert.equal((await get('/manifest')).status, 500);
  });
});

suite('privacy', () => {
  const methods = ['log', 'info', 'warn', 'error', 'debug', 'trace', 'dir', 'table'];
  let calls;
  beforeEach((t) => {
    calls = [];
    for (const m of methods) t.mock.method(console, m, (...args) => calls.push([m, args]));
  });
  afterEach(() => {
    assert.deepEqual(calls, []);
  });

  test('nothing is written to the console, whatever the request', async () => {
    await get('/manifest');
    await get('/manifest', clientHeaders({ 'expo-extra-params': 'channel="beta"' }));
    await get('/manifest', clientHeaders({ 'expo-platform': 'web' }));
    await get('/manifest', clientHeaders({ 'expo-runtime-version': '9' }));
    await get(`/assets/${ASSET}`, {});
    await get('/nope', {}, 'DELETE');
    await bucket.put(storageKeys.pointer('ios', RUNTIME, 'production'), 'not json');
    await get('/manifest');
  });

  test('nothing is written to the bucket while serving', async (t) => {
    const put = t.mock.method(bucket, 'put');
    await get('/manifest');
    await get(`/assets/${ASSET}`, {});
    assert.equal(put.mock.callCount(), 0);
  });
});
