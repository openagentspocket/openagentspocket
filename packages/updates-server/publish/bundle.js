// A signed update on disk, as `publish-update.mjs` writes it and the upload step reads it:
//
//   <dir>/manifest.json | directive.json   the exact signed bytes
//   <dir>/signature                         the expo-signature value for them
//   <dir>/assets/<sha256 hex>               every asset, content-addressed
//   <dir>/assets.json                       [{ "sha256", "contentType" }]
//   <dir>/log-entry.json                    the public log entry; the upload adds channel and time
//
// Nothing in it is secret: no key, only what the server will serve.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ASSET_ID_PATTERN, isUpdateId, POINTER_KINDS } from '../src/protocol.js';

const bodyFile = (kind) => `${kind}.json`;

/**
 * @param {string} dir must not exist yet or be empty
 * @param {{entry: import('./log.js').LogEntry, bytes: Uint8Array, signature: string,
 *   files: {sha256: string, contentType: string, bytes: Uint8Array}[]}} update
 */
export function writeBundle(dir, { entry, bytes, signature, files }) {
  mkdirSync(join(dir, 'assets'), { recursive: true });
  for (const file of files) writeFileSync(join(dir, 'assets', file.sha256), file.bytes);
  const index = files.map(({ sha256, contentType }) => ({ sha256, contentType }));
  writeFileSync(join(dir, 'assets.json'), `${JSON.stringify(index, null, 2)}\n`);
  writeFileSync(join(dir, bodyFile(entry.kind)), bytes);
  writeFileSync(join(dir, 'signature'), `${signature}\n`);
  writeFileSync(join(dir, 'log-entry.json'), `${JSON.stringify(entry, null, 2)}\n`);
}

/**
 * @returns {{entry: import('./log.js').LogEntry, bytes: Uint8Array, signature: string,
 *   assets: {sha256: string, contentType: string}[], assetPath: (sha256: string) => string}}
 */
export function readBundle(dir) {
  const entry = JSON.parse(readFileSync(join(dir, 'log-entry.json'), 'utf8'));
  if (!POINTER_KINDS.includes(entry.kind) || !isUpdateId(entry.id))
    throw new Error(`${dir}/log-entry.json has no valid kind and id`);
  const assets = JSON.parse(readFileSync(join(dir, 'assets.json'), 'utf8'));
  for (const a of assets)
    if (!ASSET_ID_PATTERN.test(a.sha256))
      throw new Error(`bad asset id ${a.sha256} in assets.json`);
  return {
    entry,
    bytes: new Uint8Array(readFileSync(join(dir, bodyFile(entry.kind)))),
    signature: readFileSync(join(dir, 'signature'), 'utf8').trim(),
    assets,
    assetPath: (sha256) => join(dir, 'assets', sha256),
  };
}
