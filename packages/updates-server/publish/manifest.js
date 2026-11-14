// The manifest and directive bodies, built from an `npx expo export` folder exactly as expo-updates
// reads them (protocol v1 "Manifest body"; expo-updates SDK 58 ExpoUpdatesUpdate.swift):
//
//   { id, createdAt, runtimeVersion,
//     launchAsset: { hash, key, contentType, url },
//     assets: [{ hash, key, contentType, fileExtension, url }],
//     metadata: {}, extra: { expoClient, commit } }
//
// - hash: base64url SHA-256 of the file, which the client checks before using it.
// - key: the file's MD5, the name Metro gives it in the export (`assets/<md5>`), how the bundle refers
//   to it (Expo's example server does the same).
// - fileExtension: required on iOS for every asset but the launch asset (the spec calls it optional).
// - url: absolute, `<base>/assets/<sha256 hex>` (the client resolves a relative one on iOS only).
// - metadata stays empty: with no metadata a server-sent manifest filter cannot exclude the update
//   a device runs, which keeps the createdAt downgrade check intact.
// - extra.expoClient: the public Expo config; the app reads Constants.expoConfig from it when it
//   runs an update (expo-manifests ExpoUpdatesManifest.swift).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, normalize } from 'node:path';

import { contentTypeFor, LAUNCH_ASSET_CONTENT_TYPE } from '../src/protocol.js';

export const sha256Hex = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const sha256Base64Url = (bytes) => createHash('sha256').update(bytes).digest('base64url');
const md5Hex = (bytes) => createHash('md5').update(bytes).digest('hex');

/**
 * JSON as ASCII bytes: anything outside printable ASCII is escaped (\uXXXX), so the signed bytes
 * survive any client that decodes the part as text and re-encodes it (Android's does).
 */
export function encodeJson(value) {
  const text = JSON.stringify(value).replace(
    /[^\x20-\x7e]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
  return new TextEncoder().encode(text);
}

/** The launch asset and assets an export lists for a platform (its `metadata.json`). */
export function readExport(exportDir, platform) {
  const metadata = JSON.parse(readFileSync(join(exportDir, 'metadata.json'), 'utf8'));
  const entry = metadata?.fileMetadata?.[platform];
  if (!entry?.bundle) throw new Error(`the export has no ${platform} bundle (metadata.json)`);
  const read = (path) => {
    const clean = normalize(path);
    if (clean.startsWith('..') || clean.startsWith('/')) throw new Error(`bad export path ${path}`);
    return readFileSync(join(exportDir, clean));
  };
  return {
    launch: { bytes: read(entry.bundle) },
    assets: (entry.assets ?? []).map((a) => ({ bytes: read(a.path), ext: a.ext })),
  };
}

/** `https://host[/prefix]` with no trailing slash; plain http only for a loopback test server. */
export function normalizeBaseUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('--base-url must be an absolute URL, e.g. https://updates.example.com');
  }
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))
    throw new Error('--base-url must be https (plain http only for a local test server)');
  if (url.search || url.hash) throw new Error('--base-url takes no query or fragment');
  return url.href.replace(/\/+$/, '');
}

/**
 * @param {{exported: ReturnType<typeof readExport>, runtimeVersion: string, baseUrl: string,
 *   expoClient: object, commit: string, id: string, createdAt: string}} input
 * @returns {{manifest: object, bytes: Uint8Array, files: {sha256: string, contentType: string, bytes: Uint8Array}[]}}
 */
export function buildManifest({
  exported,
  runtimeVersion,
  baseUrl,
  expoClient,
  commit,
  id,
  createdAt,
}) {
  const files = new Map();
  const describe = (bytes, contentType) => {
    const sha256 = sha256Hex(bytes);
    files.set(sha256, { sha256, contentType, bytes });
    return {
      hash: sha256Base64Url(bytes),
      key: md5Hex(bytes),
      contentType,
      url: `${baseUrl}/assets/${sha256}`,
    };
  };
  const launchAsset = describe(exported.launch.bytes, LAUNCH_ASSET_CONTENT_TYPE);
  const seen = new Set();
  const assets = [];
  for (const asset of exported.assets) {
    const described = describe(asset.bytes, contentTypeFor(asset.ext));
    if (seen.has(described.key)) continue;
    seen.add(described.key);
    assets.push({ ...described, fileExtension: `.${String(asset.ext).replace(/^\./, '')}` });
  }
  const manifest = {
    id,
    createdAt,
    runtimeVersion,
    launchAsset,
    assets,
    metadata: {},
    extra: { expoClient, commit },
  };
  return { manifest, bytes: encodeJson(manifest), files: [...files.values()] };
}

/**
 * A rollBackToEmbedded directive: the client goes back to the update inside the binary when
 * commitTime is newer than the update it runs (expo-updates UpdateResponse.swift,
 * LoaderSelectionPolicyFilterAware.swift).
 */
export function buildRollBackDirective(commitTime) {
  const directive = { type: 'rollBackToEmbedded', parameters: { commitTime } };
  return { directive, bytes: encodeJson(directive) };
}
