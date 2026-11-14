// Putting a verified bundle in the bucket, in the order that keeps every reader safe: assets, then
// the signed body and its signature, then the channel pointer. Until the pointer is written nothing
// serves the update; after it, everything it names is already there (README "Storage layout").
//
// Nothing is overwritten but the pointer. An object that already exists is skipped when its bytes
// are the ones the bundle has (assets are content-addressed; the same update goes to beta, then to
// production) and refused otherwise. Everything written is read back and its SHA-256 compared
// before the pointer moves, so a failed read-back leaves the pointer where it was.
//
// The stores (memory, local wrangler, real R2) are in stores.js.
import { readFileSync, statSync } from 'node:fs';
import { parsePointer, storageKeys } from '../src/protocol.js';
import { encodeJson, sha256Hex } from './manifest.js';

export { configuredBucketName, memoryStore, r2Store, wranglerLocalStore } from './stores.js';

const decode = (bytes) => new TextDecoder().decode(bytes);

/**
 * Every object the upload writes, in order, and the pointer it moves last.
 *
 * @param {ReturnType<import('./bundle.js').readBundle>} bundle
 */
export function planUpload(bundle, { channel }) {
  const { entry } = bundle;
  const signature = new TextEncoder().encode(bundle.signature);
  const assets = bundle.assets.map((asset) => {
    const path = bundle.assetPath(asset.sha256);
    return {
      key: storageKeys.asset(asset.sha256),
      source: { path },
      contentType: asset.contentType,
      sha256: asset.sha256,
      size: statSync(path).size,
      asset: true,
    };
  });
  const update = [
    { key: storageKeys.body(entry.id), bytes: bundle.bytes, contentType: 'application/json' },
    { key: storageKeys.signature(entry.id), bytes: signature, contentType: 'text/plain' },
  ].map(({ key, bytes, contentType }) => ({
    key,
    source: { bytes },
    contentType,
    sha256: sha256Hex(bytes),
    size: bytes.byteLength,
    asset: false,
  }));
  const pointer = {
    key: storageKeys.pointer(entry.platform, entry.runtimeVersion, channel),
    bytes: encodeJson({ kind: entry.kind, id: entry.id }),
    contentType: 'application/json',
  };
  return { assets, update, pointer, entry };
}

/** What a dry run prints: every object, then the pointer change (`previous` from the public log). */
export function describeUpload(plan, { previous }) {
  const line = (o) => `  ${o.key}  ${o.contentType}  ${o.size} bytes`;
  const from = previous ? `${previous.kind} ${previous.id}` : 'nothing published';
  return [
    'Would write, in this order (an object already present with the same bytes is skipped, with other bytes refused):',
    ...plan.assets.map(line),
    ...plan.update.map(line),
    'Then read every written object back and compare its SHA-256, and only then move the pointer:',
    `  ${plan.pointer.key}: ${from} -> ${plan.entry.kind} ${plan.entry.id}`,
  ];
}

async function inPool(items, size, task) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      await task(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
}

const NOT_MOVED = 'the channel pointer was not moved';

/**
 * @param {ReturnType<import('./bundle.js').readBundle>} bundle
 * @param {{channel: string,
 *   store: import('./stores.js').Store,
 *   expectedPointer?: {kind: string, id: string} | null,
 *   readAsset?: (sha256: string) => Promise<{bytes: Uint8Array, contentType?: string} | null>,
 *   afterPointer?: () => Promise<string[]>,
 *   onProgress?: (line: string) => void}} options
 *   expectedPointer: what the public log says the channel serves now; when given, a bucket that
 *     disagrees is refused before anything is written. readAsset: read assets back over HTTP from
 *     the deployed Worker instead of the store. afterPointer: checks once the pointer moved; any
 *     problem puts the previous pointer back (or removes it when there was none).
 */
export async function uploadBundle(bundle, options) {
  const { channel, store, readAsset, afterPointer, onProgress = () => {} } = options;
  store.ready();
  const plan = planUpload(bundle, { channel });
  const current = await store.get(plan.pointer.key);
  if (options.expectedPointer !== undefined) {
    const now = current ? parsePointer(decode(current)) : null;
    const expected = options.expectedPointer;
    if ((now?.id ?? null) !== (expected?.id ?? null))
      throw new Error(
        `${plan.pointer.key} names ${now ? now.id : 'nothing'}, the public log says ${expected ? expected.id : 'nothing'}: ` +
          'an upload was not logged, or the log is behind. Reconcile docs/releases/updates.jsonl first; nothing was written.',
      );
  }

  const written = [];
  const skipped = [];
  const putOnce = async (o) => {
    const existing = await store.get(o.key);
    if (existing) {
      const got = sha256Hex(existing);
      if (got !== o.sha256)
        throw new Error(
          `${o.key} already exists with other bytes (sha256 ${got}, the bundle has ${o.sha256}); nothing is overwritten and ${NOT_MOVED}`,
        );
      skipped.push(o.key);
      return;
    }
    if (o.asset && sha256Hex(new Uint8Array(readFileSync(o.source.path))) !== o.sha256)
      throw new Error(`the bundle's ${o.key} does not match its name; ${NOT_MOVED}`);
    await store.put(o.key, o.source, o.contentType);
    written.push(o);
    onProgress(`wrote ${o.key}`);
  };
  // One at a time unless the store says otherwise: the local simulation is a SQLite file that
  // concurrent wrangler processes lock each other out of.
  const parallel = store.concurrency ?? 1;
  await inPool(plan.assets, parallel, putOnce);
  for (const o of plan.update) await putOnce(o);

  await inPool(written, parallel, async (o) => {
    const back =
      o.asset && readAsset ? await readAsset(o.sha256) : { bytes: await store.get(o.key) };
    if (!back?.bytes)
      throw new Error(`read-back: ${o.key} is missing after the upload; ${NOT_MOVED}`);
    const got = sha256Hex(back.bytes);
    if (got !== o.sha256)
      throw new Error(`read-back: ${o.key} has sha256 ${got}, expected ${o.sha256}; ${NOT_MOVED}`);
    if (back.contentType !== undefined && back.contentType !== o.contentType)
      throw new Error(
        `read-back: ${o.key} is served as ${back.contentType}, expected ${o.contentType}; ${NOT_MOVED}`,
      );
  });
  onProgress(`read back ${written.length} written object(s); ${skipped.length} already present`);

  await store.put(plan.pointer.key, { bytes: plan.pointer.bytes }, plan.pointer.contentType);
  onProgress(`moved ${plan.pointer.key} to ${plan.entry.kind} ${plan.entry.id}`);
  const problems = afterPointer ? await afterPointer() : [];
  if (problems.length) {
    // Back to what the channel served before: the previous pointer, or none at all.
    if (current) await store.put(plan.pointer.key, { bytes: current }, plan.pointer.contentType);
    else await store.remove(plan.pointer.key);
    throw new Error(
      `after the pointer moved, the server check failed (${problems.join('; ')}); the pointer was put back to ${current ? 'its previous value' : 'nothing'}`,
    );
  }
  return {
    written: written.map((o) => o.key),
    skipped,
    previous: current ? parsePointer(decode(current)) : null,
  };
}
