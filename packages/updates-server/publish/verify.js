// Check an update the way the app would before using it, plus what only the publisher can know:
// signature against the certificate, runtime version against the released builds, every asset's
// SHA-256, createdAt newer than what was published before, and the public log.
//
// verifyBundle checks a bundle folder (after a dry run, before an upload); verifyRemote asks a
// server exactly as the client does and checks what it serves.
import { readFileSync } from 'node:fs';

import { CHANNEL_PARAM, isUpdateId, parseMultipart, partName, sfvString } from '../src/protocol.js';
import { readBundle } from './bundle.js';
import { previousEntries } from './log.js';
import { sha256Base64Url, sha256Hex } from './manifest.js';
import { signatureProblem } from './signing.js';

const isIsoDate = (value) =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value)) && /^\d{4}-\d\d-\d\dT/.test(value);

/** The time the client orders by: a manifest's createdAt, a directive's commitTime. */
export function updateTime(kind, body) {
  return kind === 'manifest' ? body?.createdAt : body?.parameters?.commitTime;
}

/**
 * @param {{kind: 'manifest' | 'directive', bytes: Uint8Array, signature: string,
 *   certificate: import('node:crypto').X509Certificate, keyId?: string, platform: string,
 *   runtimeVersion: string, builds: {platform: string, runtimeVersion: string}[],
 *   previous: import('./log.js').LogEntry[], (published before it, itself excluded)
 *   getAsset: (asset: object) => Promise<{bytes: Uint8Array, contentType?: string} | null>}} input
 * @returns {Promise<{problems: string[], body: any}>}
 */
export async function verifyUpdate(input) {
  const { kind, bytes, signature, certificate, keyId, platform, runtimeVersion } = input;
  const bad = signatureProblem({ bytes, header: signature, certificate, keyId });
  if (bad) return { problems: [bad], body: null };
  let body;
  try {
    body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return { problems: [`the ${kind} is not UTF-8 JSON`], body: null };
  }
  const problems = [];
  if (!input.builds.some((b) => b.platform === platform && b.runtimeVersion === runtimeVersion))
    problems.push(
      `runtime ${runtimeVersion} matches no released ${platform} build (docs/releases/builds.json)`,
    );
  const time = updateTime(kind, body);
  if (!isIsoDate(time))
    problems.push(
      `the ${kind} has no ISO 8601 ${kind === 'manifest' ? 'createdAt' : 'commitTime'}`,
    );
  if (kind === 'manifest') problems.push(...(await manifestProblems(body, input)));
  else if (body.type !== 'rollBackToEmbedded') problems.push(`unknown directive type ${body.type}`);
  for (const e of input.previous) {
    if (!(Date.parse(time) > Date.parse(e.createdAt)))
      problems.push(
        `not newer than ${e.kind} ${e.id} (${e.createdAt}); the client would ignore it`,
      );
  }
  return { problems, body };
}

async function manifestProblems(m, { runtimeVersion, getAsset }) {
  const problems = [];
  if (!isUpdateId(m.id)) problems.push('manifest id is not a lowercase UUID');
  if (m.runtimeVersion !== runtimeVersion)
    problems.push(`manifest runtimeVersion ${m.runtimeVersion}, expected ${runtimeVersion}`);
  if (!m.metadata || typeof m.metadata !== 'object' || Object.keys(m.metadata).length)
    problems.push(
      'manifest metadata must be empty (a server filter could otherwise bypass the downgrade check)',
    );
  if (!m.launchAsset || !Array.isArray(m.assets))
    return [...problems, 'manifest lacks launchAsset or assets'];
  for (const [i, asset] of [m.launchAsset, ...m.assets].entries()) {
    const name = i === 0 ? 'launchAsset' : `assets[${i - 1}]`;
    for (const field of ['hash', 'key', 'contentType', 'url'])
      if (typeof asset[field] !== 'string' || !asset[field])
        problems.push(`${name} lacks ${field}`);
    if (i > 0 && !/^\.[A-Za-z0-9]+$/.test(asset.fileExtension ?? ''))
      problems.push(`${name} lacks a fileExtension (iOS requires it)`);
    const got = await getAsset(asset);
    if (!got) {
      problems.push(`${name} (${asset.url}) cannot be fetched`);
      continue;
    }
    if (sha256Base64Url(got.bytes) !== asset.hash) problems.push(`${name} does not match its hash`);
    if (!String(asset.url).endsWith(`/assets/${sha256Hex(got.bytes)}`))
      problems.push(`${name} url is not its content address`);
    if (got.contentType !== undefined && got.contentType !== asset.contentType)
      problems.push(
        `${name} is served as ${got.contentType}, the manifest says ${asset.contentType}`,
      );
  }
  return problems;
}

const assetIdOf = (url) => /\/assets\/([0-9a-f]{64})$/.exec(String(url))?.[1];

/** Verify a bundle folder; `log` is the public log, `channel` the one it is about to go to. */
export async function verifyBundle(dir, { certificate, keyId, builds, log, channel }) {
  const bundle = readBundle(dir);
  const { entry } = bundle;
  const previous = previousEntries(log, { ...entry, channel });
  const problems = [];
  if (channel !== undefined && previous.some((e) => e.id === entry.id))
    problems.push(`${entry.kind} ${entry.id} is already published to ${channel}`);
  const known = new Set(bundle.assets.map((a) => a.sha256));
  const result = await verifyUpdate({
    ...bundle,
    kind: entry.kind,
    certificate,
    keyId,
    platform: entry.platform,
    runtimeVersion: entry.runtimeVersion,
    builds,
    previous: previous.filter((e) => e.id !== entry.id),
    getAsset: async (asset) => {
      const id = assetIdOf(asset.url);
      if (!id || !known.has(id)) return null;
      return { bytes: new Uint8Array(readFileSync(bundle.assetPath(id))) };
    },
  });
  problems.push(...result.problems);
  if (result.body) {
    if (sha256Hex(bundle.bytes) !== entry.bodySha256)
      problems.push('log-entry bodySha256 does not match the body');
    if (entry.signature !== bundle.signature)
      problems.push('log-entry signature does not match the signature file');
    if (updateTime(entry.kind, result.body) !== entry.createdAt)
      problems.push('log-entry createdAt does not match the body');
    if (entry.kind === 'manifest' && result.body.id !== entry.id)
      problems.push('log-entry id does not match the manifest');
  }
  return { problems, entry };
}

/** The headers expo-updates sends on an update check (SDK 58 FileDownloader), minus the per-install ones. */
export function clientHeaders({ platform, runtimeVersion, channel, keyId = 'main' }) {
  return {
    accept: 'multipart/mixed,application/expo+json,application/json',
    'expo-platform': platform,
    'expo-protocol-version': '1',
    'expo-api-version': '1',
    'expo-updates-environment': 'BARE',
    'expo-json-error': 'true',
    'expo-runtime-version': runtimeVersion,
    'expo-expect-signature': `sig, keyid=${sfvString(keyId)}, alg="rsa-v1_5-sha256"`,
    ...(channel ? { 'expo-extra-params': `${CHANNEL_PARAM}=${sfvString(channel)}` } : {}),
  };
}

/**
 * Ask a server for an update as the app does and verify what comes back. The served update must
 * be the newest one the public log records for that channel, byte for byte (`requireLogged`).
 */
export async function verifyRemote({
  manifestUrl,
  platform,
  runtimeVersion,
  channel,
  certificate,
  keyId,
  builds,
  log,
  requireLogged = true,
  fetchImpl = fetch,
}) {
  const res = await fetchImpl(manifestUrl, {
    headers: clientHeaders({ platform, runtimeVersion, channel, keyId }),
  });
  if (res.status === 204) return { problems: [], served: null };
  if (res.status !== 200) return { problems: [`the server answered ${res.status}`], served: null };
  const problems = [];
  if (res.headers.get('expo-protocol-version') !== '1')
    problems.push('no expo-protocol-version: 1');
  const boundary = /boundary=([^;]+)/.exec(res.headers.get('content-type') ?? '')?.[1];
  const parts = boundary ? parseMultipart(new Uint8Array(await res.arrayBuffer()), boundary) : null;
  if (!parts)
    return {
      problems: [...problems, 'the response is not readable multipart/mixed'],
      served: null,
    };
  const part = parts.find((p) => ['manifest', 'directive'].includes(partName(p.headers)));
  if (!part) return { problems: [...problems, 'no manifest or directive part'], served: null };
  const kind = partName(part.headers);
  const channelEntries = previousEntries(log, { platform, runtimeVersion, channel });
  const bodySha256 = sha256Hex(part.body);
  const logged = channelEntries.find((e) => e.bodySha256 === bodySha256);
  const result = await verifyUpdate({
    kind,
    bytes: part.body,
    signature: part.headers['expo-signature'],
    certificate,
    keyId,
    platform,
    runtimeVersion,
    builds,
    previous: channelEntries.filter((e) => e !== logged),
    getAsset: async (asset) => {
      const r = await fetchImpl(asset.url);
      if (!r.ok) return null;
      return {
        bytes: new Uint8Array(await r.arrayBuffer()),
        contentType: r.headers.get('content-type') ?? '',
      };
    },
  });
  problems.push(...result.problems);
  if (requireLogged && !logged)
    problems.push('the served update is not in the public log for this channel');
  return { problems, served: { kind, bodySha256, logged: Boolean(logged) } };
}
