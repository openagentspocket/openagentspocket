// Expo config = app.json plus the owner's account values, which never go in git (the repo is open source):
// app.local.json ({ "appleTeamId": "..." }, or APPLE_TEAM_ID in the environment) and google-services.json
// from the owner's Firebase project. Without them the app still builds (no signing team, no FCM).
//
// Two build values come from the environment (docs/decisions/0008-local-builds.md):
// - APNS_ENVIRONMENT (or "apnsEnvironment" in app.local.json, which an Xcode archive started from the
//   Dock also sees): `development` (default, device installs signed with a development profile) or
//   `production` (App Store / TestFlight). It sets the `aps-environment` entitlement, and the app reads
//   the same value at runtime to tag its push token as sandbox or production.
// - BUILD_NUMBER: overrides the checked-in ios.buildNumber (app.json); the same integer becomes
//   android.versionCode, so both stores move together.
//
// Over-the-air updates (docs/decisions/0028-over-the-air-updates.md, docs/guides/updates.md) are on
// only in official store builds, switched by one value: UPDATES_URL (or "updatesUrl" in
// app.local.json), the update server's manifest URL. Without it, and in any build whose
// APNS_ENVIRONMENT is not `production` (device installs, the simulator suite, development builds),
// `updates.enabled` is false: the app never contacts an update server and runs only its embedded JS.
// An enabled build must carry the code signing certificate, so it refuses unsigned updates.
const fs = require('node:fs');
const path = require('node:path');

const APNS_ENVIRONMENTS = ['development', 'production'];
// Google Play's ceiling for versionCode.
const MAX_VERSION_CODE = 2100000000;

function apnsEnvironment(env, local) {
  const value = env.APNS_ENVIRONMENT || local.apnsEnvironment || 'development';
  if (!APNS_ENVIRONMENTS.includes(value)) {
    throw new Error(
      `APNS_ENVIRONMENT must be one of ${APNS_ENVIRONMENTS.join(', ')}; got "${value}"`,
    );
  }
  return value;
}

// The committed public certificate (owner step 1 of docs/guides/updates.md).
const UPDATES_CERTIFICATE = './certs/updates.pem';
const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost', '[::1]'];

function updatesConfig(env, local, aps) {
  const url = env.UPDATES_URL || local.updatesUrl;
  if (!url || aps !== 'production') return { enabled: false };
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`UPDATES_URL must be the update server's manifest URL; got "${url}"`);
  }
  const loopback = LOOPBACK_HOSTS.includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !(loopback && parsed.protocol === 'http:')) {
    throw new Error(`UPDATES_URL must use https (plain http only to loopback); got "${url}"`);
  }
  // A throwaway certificate for the local end-to-end test (wrangler dev), never for a real server.
  const override = env.UPDATES_CERTIFICATE || local.updatesCertificate;
  if (override && !loopback) {
    throw new Error('UPDATES_CERTIFICATE is only for a loopback UPDATES_URL (the local test)');
  }
  // Prebuild joins this path to apps/mobile, so it stays relative to it.
  const certificate = override
    ? path.relative(__dirname, path.resolve(__dirname, override))
    : UPDATES_CERTIFICATE;
  if (!fs.existsSync(path.join(__dirname, certificate))) {
    throw new Error(
      `UPDATES_URL is set but the code signing certificate ${certificate} is missing: ` +
        'an official build never accepts unsigned updates (docs/guides/updates.md)',
    );
  }
  return {
    enabled: true,
    url,
    codeSigningCertificate: certificate,
    codeSigningMetadata: { keyid: 'main', alg: 'rsa-v1_5-sha256' },
    checkAutomatically: 'ON_LOAD',
    fallbackToCacheTimeout: 0,
    // The server never sends patches; keep requests plain.
    enableBsdiffPatchSupport: false,
  };
}

function buildNumber(env, config) {
  const raw = env.BUILD_NUMBER || config.ios?.buildNumber;
  const value = String(raw ?? '').trim();
  const number = Number(value);
  if (!/^\d+$/.test(value) || number < 1 || number > MAX_VERSION_CODE) {
    throw new Error(`BUILD_NUMBER must be an integer from 1 to ${MAX_VERSION_CODE}; got "${raw}"`);
  }
  return number;
}

module.exports = ({ config }) => {
  const env = process.env;
  const localFile = path.join(__dirname, 'app.local.json');
  const local = fs.existsSync(localFile) ? JSON.parse(fs.readFileSync(localFile, 'utf8')) : {};
  const appleTeamId = env.APPLE_TEAM_ID || local.appleTeamId;
  const hasGoogleServices = fs.existsSync(path.join(__dirname, 'google-services.json'));
  const build = buildNumber(env, config);
  const aps = apnsEnvironment(env, local);
  return {
    ...config,
    updates: updatesConfig(env, local, aps),
    ios: {
      ...config.ios,
      ...(appleTeamId ? { appleTeamId } : {}),
      buildNumber: String(build),
      entitlements: { ...config.ios?.entitlements, 'aps-environment': aps },
    },
    android: {
      ...config.android,
      versionCode: build,
      ...(hasGoogleServices ? { googleServicesFile: './google-services.json' } : {}),
    },
  };
};
