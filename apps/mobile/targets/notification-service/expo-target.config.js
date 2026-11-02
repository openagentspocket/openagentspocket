/**
 * The Notification Service Extension: decrypts an Agent Notification before iOS shows it
 * (ADR 0008), reusing the Swift app's NotificationCore (see README.md here).
 * The group must match modules/app-group (APP_GROUP) and ios.entitlements in app.json: it is both
 * the App Group and the Keychain access group the Notification Keys are shared through.
 * @type {import('@bacons/apple-targets/app.plugin').Config}
 */
module.exports = {
  type: 'notification-service',
  name: 'notification-service',
  displayName: 'OpenAgentsPocket Notifications',
  deploymentTarget: '18.0',
  entitlements: {
    'com.apple.security.application-groups': ['group.com.openagentspocket.app'],
  },
};
