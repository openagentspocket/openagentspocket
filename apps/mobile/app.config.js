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
  return {
    ...config,
    ios: {
      ...config.ios,
      ...(appleTeamId ? { appleTeamId } : {}),
      buildNumber: String(build),
      entitlements: { ...config.ios?.entitlements, 'aps-environment': apnsEnvironment(env, local) },
    },
    android: {
      ...config.android,
      versionCode: build,
      ...(hasGoogleServices ? { googleServicesFile: './google-services.json' } : {}),
    },
  };
};
