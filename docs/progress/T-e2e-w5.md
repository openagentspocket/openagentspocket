# T-e2e-w5: Fixes from the last native check
status: done
branch: see git (worktree branch)
changed: e2e/{home,live,hosts}.yaml, docs/e2e-live-backend.md, docs/tasks.yml, apps/mobile/src/notifications/devicePushToken{,.test}.ts, apps/mobile/src/connections/deviceServices.ts, apps/mobile/src/links/useIncomingLinks{,.test}.ts*, apps/mobile/src/features/hosts/HostFormScreen.tsx, packages/ui/src/primitives/{Screen,primitives.test}.tsx
tests: pnpm verify-fast -> green
acceptance:
- (1) P5.4c push token: the live services already use the real source (T-verify-fixes-w4); demo source only backs the demo-mode fallback of useNotificationServices. The expo-notifications adapter moved to devicePushToken.ts (`lazyNotifications`) and is tested against a fake expo-notifications module (request then token): met (devicePushToken.test.ts)
- (2) e2e/home.yaml scrolls to the demo switch and opens Home by link (no `back`); e2e/live.yaml walks Home -> More -> Agents -> agent detail -> Changes (agent-row-*, agent-header, agent-more-menu, changes-screen); hosts.yaml and docs/e2e-live-backend.md document the EXPO_PUBLIC_DEMO=1 build: met (flows not run, integrator)
- (3) Android cold start: useIncomingLinks reads Linking.getInitialURL once per process when the root navigator is ready and routes it through redirectLink: met in unit tests (device check pending)
- (4) Host form port focus: Screen gained `keyboardAvoiding` (KeyboardAvoidingView), used by the Host form. Likely cause: Android edge-to-edge no longer resizes the window, so the keyboard covered the lower fields and the tap hit the keys while the previous field kept focus. Not reproduced on a device: met in unit test, needs the Android check
left:
- Integrator: rerun e2e/live.yaml on Android (cold-start link, route-0-port focus) and the iOS notification prompt
- If Home's More menu label changes in UX1, update `tapOn: "More"` in live.yaml
notes: the "More" and "Agents" taps use labels, not ids, so they survive Home testID changes.
