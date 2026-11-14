// The record of store builds and their runtime versions, docs/releases/builds.json (ADR 0028,
// Runtime version). scripts/release-ios.mjs appends one entry per archived build; the update
// publish script refuses an update whose runtime version matches no recorded build, and reads the
// build's number for the update's embedded config. The file is committed: the repo is public, so
// anyone can see which builds an update can reach.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const BUILDS_FILE = join('docs', 'releases', 'builds.json');
const FIELDS = ['platform', 'version', 'build', 'runtimeVersion', 'commit', 'archivedAt'];

/** @typedef {{platform: string, version: string, build: string, runtimeVersion: string, commit: string, archivedAt: string}} ReleasedBuild */

/** @returns {ReleasedBuild[]} */
export function readBuilds(file) {
  if (!existsSync(file)) return [];
  const builds = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(builds)) throw new Error(`${file} is not a JSON array`);
  return builds;
}

/**
 * Append a build. A build (platform, version, build number) is recorded once: archiving the same
 * number again is an error, since the store would refuse it too.
 *
 * @param {string} file
 * @param {ReleasedBuild} entry
 */
export function appendBuild(file, entry) {
  const missing = FIELDS.filter((f) => typeof entry[f] !== 'string' || entry[f] === '');
  if (missing.length) throw new Error(`build record lacks ${missing.join(', ')}`);
  const builds = readBuilds(file);
  const same = (b) =>
    b.platform === entry.platform && b.version === entry.version && b.build === entry.build;
  if (builds.some(same))
    throw new Error(`${entry.platform} ${entry.version} (${entry.build}) is already recorded`);
  const record = Object.fromEntries(FIELDS.map((f) => [f, entry[f]]));
  writeFileSync(file, `${JSON.stringify([...builds, record], null, 2)}\n`);
  return record;
}

/**
 * The iOS build phase of expo-updates writes the runtime version it embedded to
 * EXUpdates.bundle/fingerprint in the app (scripts/create-updates-resources-ios.sh), whether updates
 * are on or off in that build. It must equal the one computed for the record, or updates would target
 * a runtime no device runs. Returns the problem, or null when they agree.
 */
export function embeddedRuntimeProblem(appPath, runtimeVersion) {
  const file = join(appPath, 'EXUpdates.bundle', 'fingerprint');
  if (!existsSync(file))
    return 'the build embeds no runtime version (EXUpdates.bundle/fingerprint): is expo-updates linked?';
  const embedded = readFileSync(file, 'utf8').trim();
  return embedded === runtimeVersion
    ? null
    : `the build embeds runtime ${embedded}, the record would say ${runtimeVersion}`;
}

/**
 * The official-build flag, read as apps/mobile/app.config.js reads it: the update server's manifest
 * URL, or null for a build without over-the-air updates.
 */
export function officialUpdatesUrl(env, local) {
  return env.UPDATES_URL || local.updatesUrl || null;
}

/**
 * What a store build's Expo.plist must say about updates (apps/mobile/app.config.js): with the flag,
 * enabled, from that URL, code signed with the project's key id; without it, disabled.
 *
 * @param {Record<string, unknown>} expoPlist
 * @param {string | null} url the flag the build was made with
 * @returns {string[]} the problems, empty when the build is as expected
 */
export function embeddedUpdatesProblems(expoPlist, url) {
  if (!url)
    return expoPlist.EXUpdatesEnabled === false
      ? []
      : ['updates are not disabled in Expo.plist, but no UPDATES_URL was set'];
  const problems = [];
  if (expoPlist.EXUpdatesEnabled !== true) problems.push('updates are not enabled in Expo.plist');
  if (expoPlist.EXUpdatesURL !== url)
    problems.push(`Expo.plist updates URL is ${expoPlist.EXUpdatesURL}, expected ${url}`);
  if (!/BEGIN CERTIFICATE/.test(String(expoPlist.EXUpdatesCodeSigningCertificate ?? '')))
    problems.push('Expo.plist carries no code signing certificate: updates would be unsigned');
  const metadata = /** @type {{keyid?: string, alg?: string}} */ (
    expoPlist.EXUpdatesCodeSigningMetadata ?? {}
  );
  if (metadata.keyid !== 'main' || metadata.alg !== 'rsa-v1_5-sha256')
    problems.push('Expo.plist code signing metadata is not keyid main, rsa-v1_5-sha256');
  if (expoPlist.EXUpdatesRuntimeVersion !== 'file:fingerprint')
    problems.push('Expo.plist runtime version is not the embedded fingerprint');
  return problems;
}

/**
 * Everything a built iOS app says about over-the-air updates: the embedded runtime version and the
 * Expo.plist updates config, against this commit's runtime and the official-build flag.
 *
 * @param {string} appPath
 * @param {{runtimeVersion: string, url: string | null, plist: (file: string) => Record<string, unknown>}} options
 */
export function bundleUpdatesReport(appPath, { runtimeVersion, url, plist }) {
  const runtime = embeddedRuntimeProblem(appPath, runtimeVersion);
  const problems = [
    ...(runtime ? [runtime] : []),
    ...embeddedUpdatesProblems(plist(join(appPath, 'Expo.plist')), url),
  ];
  const state = url ? `on, signed, from ${url}` : 'off';
  return { problems, summary: `runtime ${runtimeVersion}, over-the-air updates ${state}` };
}

/** The recorded builds an update for this runtime version can reach, newest last. */
export function buildsForRuntime(builds, platform, runtimeVersion) {
  return builds.filter((b) => b.platform === platform && b.runtimeVersion === runtimeVersion);
}
