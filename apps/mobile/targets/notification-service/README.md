# notification-service target

iOS Notification Service Extension generated at prebuild by `@bacons/apple-targets`
(see `expo-target.config.js`). iOS hands every `mutable-content` push through it; it picks the
Host's Notification Key by the envelope's `kid`, decrypts, and rewrites the alert to
"workspace · Agent kind" plus status. Anything undecryptable gets the generic fallback banner.

## Provenance

Copied from the native Swift app (Agentico) with no logic changes: `NotificationService.swift`,
`NotificationCore/` (identical to `../widgets/NotificationCore`, which the widget extension also
compiles), `Support/` (Base64URL, SecretStore, JSONValue, HerdrAPITypes) and the xcstrings.
Only the Keychain service and the shared group were renamed to the placeholders below.
`native-tests/notification-service/run.sh` fails if the two NotificationCore copies drift.

## Shared key

The app writes one Keychain item per Host (service `com.openagentspocket.notifications`, access
group `group.com.openagentspocket.app`, account = Host id, value `{v:1,name,key}`) through
`modules/app-group` (`keychainSave`); the extension reads them with the same service and group.

## Placeholders

App Group / Keychain access group: `group.com.openagentspocket.app` (app.json `ios.entitlements`,
`modules/app-group` `APP_GROUP`, this config). Bundle id of the app: `com.openagentspocket.app`;
the extension gets `com.openagentspocket.app.notification-service`.
Set `ios.appleTeamId` in app.json once the Apple team is active. Real remote push also needs the
`aps-environment` entitlement and an APNs key on the relay (not created yet).

## Tests

`pnpm --filter @openagentspocket/mobile test:nse` (needs macOS + swiftc): compiles NotificationCore and runs the
shared vectors (`packages/plugin/test-vectors/notification-payload-v1.json`) through the renderer.
