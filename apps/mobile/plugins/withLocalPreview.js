// Allows the ports preview WebView to load http://127.0.0.1:<port>/ (the local end of an SSH
// forward): Android cleartext to loopback only, iOS NSAllowsLocalNetworking only.
const { withAndroidManifest, withDangerousMod, withInfoPlist } = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

const CONFIG_NAME = 'network_security_config';

const NETWORK_SECURITY_CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false" />
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">127.0.0.1</domain>
    <domain includeSubdomains="false">localhost</domain>
  </domain-config>
</network-security-config>
`;

function withAndroidLoopbackCleartext(config) {
  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, 'app/src/main/res/xml');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${CONFIG_NAME}.xml`), NETWORK_SECURITY_CONFIG);
      return cfg;
    },
  ]);
  return withAndroidManifest(config, (cfg) => {
    const application = cfg.modResults.manifest.application?.[0];
    if (application) {
      application.$['android:networkSecurityConfig'] = `@xml/${CONFIG_NAME}`;
    }
    return cfg;
  });
}

function withIosLocalNetworking(config) {
  return withInfoPlist(config, (cfg) => {
    const ats = cfg.modResults.NSAppTransportSecurity ?? {};
    ats.NSAllowsLocalNetworking = true;
    cfg.modResults.NSAppTransportSecurity = ats;
    return cfg;
  });
}

module.exports = function withLocalPreview(config) {
  return withIosLocalNetworking(withAndroidLoopbackCleartext(config));
};
