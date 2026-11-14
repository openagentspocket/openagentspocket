// Over-the-air updates are iOS only for now (docs/decisions/0028-over-the-air-updates.md, Decided:
// Android stays off until its client's handling of a missing or bad signature is verified on a
// device). App config has one `updates` block for both platforms, so this turns the Android side off
// after expo-updates writes it: an Android build never contacts the update server.
const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

const ENABLED = 'expo.modules.updates.ENABLED';

module.exports = function withUpdatesIosOnly(config) {
  return withAndroidManifest(config, (cfg) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(application, ENABLED, 'false');
    return cfg;
  });
};
