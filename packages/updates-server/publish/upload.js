// Putting a verified bundle in the bucket, in the order that keeps every reader safe: assets, then
// the signed body and its signature, then the channel pointer. Until the pointer is written nothing
// serves the update; after it, everything it names is already there.
//
// A store is { name, ready(), put(key, {path?, bytes?}, contentType) }. Three exist:
// - memoryStore: the in-memory bucket, for tests;
// - wranglerLocalStore: the local R2 simulation `wrangler dev` reads (no account);
// - r2Store: the real bucket. OWNER STEP, NOT RUN: it refuses before writing anything until the
//   owner has created the bucket and wired credentials (docs/guides/updates.md, "Owner steps").
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { storageKeys } from '../src/protocol.js';
import { encodeJson } from './manifest.js';

const PACKAGE_DIR = join(import.meta.dirname, '..');

/**
 * @param {ReturnType<import('./bundle.js').readBundle>} bundle
 * @param {{channel: string, store: {name: string, ready(): void, put(key: string, source: {path?: string, bytes?: Uint8Array}, contentType: string): Promise<void> | void}}} options
 */
export async function uploadBundle(bundle, { channel, store }) {
  store.ready();
  const { entry } = bundle;
  for (const asset of bundle.assets)
    await store.put(
      storageKeys.asset(asset.sha256),
      { path: bundle.assetPath(asset.sha256) },
      asset.contentType,
    );
  await store.put(storageKeys.body(entry.id), { bytes: bundle.bytes }, 'application/json');
  await store.put(
    storageKeys.signature(entry.id),
    { bytes: new TextEncoder().encode(bundle.signature) },
    'text/plain',
  );
  const pointer = encodeJson({ kind: entry.kind, id: entry.id });
  await store.put(
    storageKeys.pointer(entry.platform, entry.runtimeVersion, channel),
    { bytes: pointer },
    'application/json',
  );
}

const sourceBytes = (source) => source.bytes ?? new Uint8Array(readFileSync(source.path));

export function memoryStore(bucket) {
  return {
    name: 'memory',
    ready() {},
    async put(key, source, contentType) {
      await bucket.put(key, sourceBytes(source), { httpMetadata: { contentType } });
    },
  };
}

/** The bucket name wrangler.toml binds as UPDATES. */
export function configuredBucketName(packageDir = PACKAGE_DIR) {
  const toml = readFileSync(join(packageDir, 'wrangler.toml'), 'utf8');
  const name = /\[\[r2_buckets\]\][^[]*?bucket_name\s*=\s*"([^"]+)"/s.exec(toml)?.[1];
  if (!name) throw new Error('wrangler.toml binds no R2 bucket');
  return name;
}

/**
 * The local R2 simulation in packages/updates-server/.wrangler/state, the one `wrangler dev` serves.
 * Uses `npx wrangler r2 object put --local`, which needs no Cloudflare account.
 */
export function wranglerLocalStore({ scratchDir, packageDir = PACKAGE_DIR, persistTo }) {
  const bucket = configuredBucketName(packageDir);
  return {
    name: 'local',
    ready() {},
    put(key, source, contentType) {
      let file = source.path;
      if (!file) {
        file = join(scratchDir, key.replaceAll('/', '_'));
        writeFileSync(file, source.bytes);
      }
      const args = [
        'wrangler',
        'r2',
        'object',
        'put',
        `${bucket}/${key}`,
        '--file',
        file,
        '--content-type',
        contentType,
        '--local',
      ];
      if (persistTo) args.push('--persist-to', persistTo);
      const result = spawnSync('npx', args, { cwd: packageDir, encoding: 'utf8' });
      if (result.status !== 0)
        throw new Error(
          `wrangler r2 object put ${key} failed: ${(result.stderr || result.stdout).trim()}`,
        );
    },
  };
}

/** The real R2 bucket: an owner step that has not been run. Refuses before anything is written. */
export function r2Store() {
  return {
    name: 'r2',
    ready() {
      throw new Error(
        'uploading to the real R2 bucket is an owner step that has not been set up: create the bucket, ' +
          'deploy the Worker, then implement this store (docs/guides/updates.md, "Owner steps"). Nothing was uploaded.',
      );
    },
    put() {
      throw new Error('r2Store is not set up');
    },
  };
}
