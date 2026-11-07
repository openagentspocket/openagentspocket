# widgets target

iOS widget extension generated at prebuild by `@bacons/apple-targets` (see `expo-target.config.js`).

## Provenance

The Swift sources are copied from the native Swift app (Agentico) with no logic changes, except that
the Live Activity's Approve and Deny are links here, not intents: a button opens the app, which reads
the prompt from the Host and answers through the notification's gates (`AgentActivityLink.answerURL`,
`apps/mobile/src/live-activity/LiveActivityActions.tsx`). Sources:
`UsageCore`, `Widgets` (Usage widgets, Live Activity UI, island, rows), `ActivityCore`,
`NotificationCore`, `Theme`, `Support`. They contain no personal identifiers (checked by grep).

## Sync procedure

1. Copy the changed files from the Swift app over the same relative path here.
2. Keep the group identifier at the placeholder below; never commit a real team or account id.
3. `npx expo prebuild --clean`, then build the simulator app (integrator only).

## Placeholder group

App Group: `group.com.openagentspocket.app`. It must match `APP_GROUP` in `modules/app-group`,
`ios.entitlements` in `apps/mobile/app.json` and `expo-target.config.js`.
Set `ios.appleTeamId` in app.json once the Apple team is active (needed for a device build).

## Scope

Usage widgets are wired (TS snapshot builder -> `modules/app-group` -> `usage-widgets.json`).
The Live Activity views live here; `modules/live-activity` starts, updates and ends the activity through
ActivityKit (task P6.1b). `AgentActivityAttributes` exists twice on purpose: here and in
`modules/live-activity/ios/AgentActivityAttributes.swift` (an activity is matched by type name and its
Codable shape, so keep both identical; the type name is shipped-forever). The widget decrypts with the
Notification Key from the Keychain, or from `notification-keys.json` in the App Group when the device is
locked.
