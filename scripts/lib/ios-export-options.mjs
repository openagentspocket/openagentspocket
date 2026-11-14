// The ExportOptions.plist of an App Store Connect export (scripts/release-ios.mjs): `export` writes the
// IPA locally, `upload` sends the same signed build to Apple.
export function exportOptions(destination) {
  // Automatic signing: Xcode picks the distribution certificate and App Store profiles for the app and
  // each extension. The build number is ours (app.json), never Xcode's.
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>${destination}</string>
  <key>signingStyle</key><string>automatic</string>
  <key>uploadSymbols</key><true/>
  <key>manageAppVersionAndBuildNumber</key><false/>
</dict>
</plist>
`;
}
