// The app's runtime version, computed the way expo-updates computes it for a store build (ADR 0028,
// Runtime version): the `fingerprint` policy, iOS or Android, native folders ignored because they
// are generated (CNG, the "managed" workflow), fingerprint.config.js applied. Shared by
// scripts/release-ios.mjs (records it per build) and scripts/publish-update.mjs (refuses an update
// no build can run).
//
// The fingerprint hashes the resolved Expo config, so it depends on the environment the config is
// resolved in: APNS_ENVIRONMENT changes the aps-environment entitlement and with it the hash
// (BUILD_NUMBER does not). Store builds use RUNTIME_ENV, so this does too.
//
// Mirrors expo-updates SDK 58 utils/src/createFingerprintAsync.ts (managed branch):
//   createFingerprintAsync(projectRoot, { platforms: [platform], ignorePaths: ['android/**/*', 'ios/**/*'] })
// When expo-updates is installed, its own CLI (`expo-updates runtimeversion:resolve`) is run as well
// and any difference is an error.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';

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

function hasExpoUpdates(mobileDir) {
  try {
    createRequire(join(mobileDir, 'package.json')).resolve('expo-updates/package.json');
    return true;
  } catch {
    return false;
  }
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
  if (hasExpoUpdates(mobileDir)) {
    const out = run(
      'npx',
      ['expo-updates', 'runtimeversion:resolve', '--platform', platform, '--workflow', 'managed'],
      { cwd: mobileDir },
    );
    const resolved = JSON.parse(out.split('\n').at(-1)).runtimeVersion;
    if (resolved !== hash)
      throw new Error(`expo-updates resolves runtime ${resolved}, this script computed ${hash}`);
  }
  return hash;
}
