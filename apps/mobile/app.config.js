// Expo config = app.json plus the owner's account values, which never go in git (the repo is open source):
// app.local.json ({ "appleTeamId": "..." }, or APPLE_TEAM_ID in the environment) and google-services.json
// from the owner's Firebase project. Without them the app still builds (no signing team, no FCM).
const fs = require('node:fs');
const path = require('node:path');

module.exports = ({ config }) => {
  const localFile = path.join(__dirname, 'app.local.json');
  const local = fs.existsSync(localFile) ? JSON.parse(fs.readFileSync(localFile, 'utf8')) : {};
  const appleTeamId = process.env.APPLE_TEAM_ID || local.appleTeamId;
  const hasGoogleServices = fs.existsSync(path.join(__dirname, 'google-services.json'));
  return {
    ...config,
    ios: { ...config.ios, ...(appleTeamId ? { appleTeamId } : {}) },
    android: {
      ...config.android,
      ...(hasGoogleServices ? { googleServicesFile: './google-services.json' } : {}),
    },
  };
};
