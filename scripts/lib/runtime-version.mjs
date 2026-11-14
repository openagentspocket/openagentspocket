// The app's runtime version, computed the way expo-updates computes it for a store build (ADR 0028,
// Runtime version): the `fingerprint` policy, iOS or Android, native folders ignored because they
// are generated (CNG, the "managed" workflow), fingerprint.config.js applied. Shared by
// scripts/release-ios.mjs (records it per build) and scripts/publish-update.mjs (refuses an update
// no build can run).
//
// The fingerprint hashes the resolved Expo config, so it depends on the environment the config is
// resolved in: APNS_ENVIRONMENT changes the aps-environment entitlement and with it the hash
// (BUILD_NUMBER does not). Store builds use RUNTIME_ENV, so this does too. The `updates` fields that
// only an official build has (UPDATES_URL) are left out of the hash by apps/mobile/fingerprint.config.js,
// so this matches an official build without knowing its update URL.
//
// Mirrors expo-updates SDK 58 utils/src/createFingerprintAsync.ts (managed branch):
//   createFingerprintAsync(projectRoot, { platforms: [platform], ignorePaths: ['android/**/*', 'ios/**/*'] })
// expo-updates' own CLI (`expo-updates runtimeversion:resolve`) is run as well and any difference is
// an error, so a change in how expo-updates fingerprints cannot slip past this copy.
import { spawnSync } from 'node:child_process';

export const RUNTIME_ENV = { APNS_ENVIRONMENT: 'production' };

const CHILD = `
import { createRequire } from 'node:module';
const [mobileDir, platform] = process.argv.slice(1);
const { createFingerprintAsync } = createRequire(mobileDir + '/package.json')('expo/fingerprint');
const fingerprint = await createFingerprintAsync(mobileDir, {
  platforms: [platform],
  ignorePaths: ['android/**/*', 'ios/**/*'],
  silent: true,
});
process.stdout.write(fingerprint.hash);
`;

function run(cmd, args, options) {
  const result = spawnSync(cmd, args, {
    encoding: 'utf8',
    ...options,
    env: { ...process.env, ...RUNTIME_ENV },
  });
  if (result.status !== 0)
    throw new Error(`${cmd} ${args[0]} failed: ${(result.stderr || result.stdout || '').trim()}`);
  return result.stdout.trim();
}

/**
 * @param {{mobileDir: string, platform: 'ios' | 'android'}} options
 * @returns {string} the runtime version (a fingerprint hash)
 */
export function computeRuntimeVersion({ mobileDir, platform }) {
  const hash = run(process.execPath, ['--input-type=module', '-e', CHILD, mobileDir, platform], {
    cwd: mobileDir,
  });
  if (!/^[0-9a-f]{40}$/.test(hash)) throw new Error(`unexpected fingerprint output: ${hash}`);
  const out = run(
    'npx',
    ['expo-updates', 'runtimeversion:resolve', '--platform', platform, '--workflow', 'managed'],
    { cwd: mobileDir },
  );
  const resolved = JSON.parse(out.split('\n').at(-1)).runtimeVersion;
  if (resolved === null)
    throw new Error('expo-updates resolves no runtime: apps/mobile/app.json needs runtimeVersion');
  if (resolved !== hash)
    throw new Error(`expo-updates resolves runtime ${resolved}, this script computed ${hash}`);
  return hash;
}
