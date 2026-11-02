/**
 * The Usage widgets and the agent Live Activity, reused from the Swift app (see README.md here).
 * The App Group must match modules/app-group (APP_GROUP) and ios.entitlements in app.json.
 * @type {import('@bacons/apple-targets/app.plugin').Config}
 */
module.exports = {
  type: 'widget',
  name: 'widgets',
  displayName: 'OpenAgentsPocket',
  deploymentTarget: '18.0',
  frameworks: ['SwiftUI', 'WidgetKit', 'ActivityKit', 'AppIntents', 'Charts'],
  entitlements: {
    'com.apple.security.application-groups': ['group.com.openagentspocket.app'],
  },
};
