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
 * With expo-updates installed, the iOS build phase writes the runtime version it embedded to
 * EXUpdates.bundle/fingerprint in the app (expo-updates scripts/create-updates-resources-ios.sh).
 * It must equal the one computed for the record, or updates would target a runtime no device runs.
 * Returns the problem, or null when they agree or the app embeds none (no expo-updates yet).
 */
export function embeddedRuntimeProblem(appPath, runtimeVersion) {
  const file = join(appPath, 'EXUpdates.bundle', 'fingerprint');
  if (!existsSync(file)) return null;
  const embedded = readFileSync(file, 'utf8').trim();
  return embedded === runtimeVersion
    ? null
    : `the build embeds runtime ${embedded}, the record would say ${runtimeVersion}`;
}

/** The recorded builds an update for this runtime version can reach, newest last. */
export function buildsForRuntime(builds, platform, runtimeVersion) {
  return builds.filter((b) => b.platform === platform && b.runtimeVersion === runtimeVersion);
}
