# N-rebuild-notifications: native checks retried after the full-disk block
status: partial
branch: worktree-wf_ec0a968a-c0f-1
changed: docs/progress/N-rebuild-notifications.md only (no code)
tests: `npx expo prebuild --clean` ok; iOS Release simulator build ok (ARCHS=arm64 ONLY_ACTIVE_ARCH=YES); Android `assembleRelease` ok (8m12s)
acceptance:
- (1) enabling notifications asks for the OS permission: FAILED. Settings > Notifications > Enable shows the explainer; Continue goes straight to
  "Ready to configure Host notifications" with no iOS permission alert (screens 02-04). The app still wires the demo push token source (P5.4c).
  `xcrun simctl privacy ... grant notifications` is refused on this simulator ("Failed to set access"), so permission stayed undetermined;
  `xcrun simctl push` was accepted but no banner appeared (05-push.png). NSE decrypt not observed.
- (2) Maestro iOS: e2e/home.yaml FAILED as written: `settings.general.demoMode` is below the fold on the new Settings and `back` does nothing on a
  root Settings; with a scroll + `openLink /` instead of `back` (home-scroll.yaml) it PASSES. e2e/hosts.yaml FAILED ("Trust this Host?" never shown): it
  needs an EXPO_PUBLIC_DEMO build, this build is live (not re-built with demo). e2e/live.yaml: PASSES up to and including Home showing the live agent
  (add host, trust, Connected, In Use, live Working agent; live-home.png); FAILS at `toolbar-menu` (id gone: Home now has a header capsule + "More"
  and no Agents id `agent-row-*` on Home; the Agents list is not reached the same way). The Agent detail / Changes steps were NOT verified.
- (3) swipe row in /__gallery?section=parity (leading and trailing swipes, haptics): PASS, no crash, app process alive, no new crash report.
- (4) Android `am start -W -a VIEW -d openagentspocket:///hosts` with the app open: PASS (Home -> Hosts, screens android-1/2).
- (5) Android e2e/live.yaml: FAILED. After `launchApp clearState` the cold-start link lands on Home, not Hosts (and `hosts-add` is not found there),
  then in the Host form `route-0-port` tap focuses the wrong field: the typed text lands in the address or user field (host saved as "10.47421" or
  user "rap r47421"), so the SSH connect fails. Cause of the focus miss not investigated.
left:
- P5.4c: call `requestNotificationAuthorization` from the real push token source, then redo (1) with the key from the vector in P5.4-ios-push.md.
- Update e2e/home.yaml (scroll to demoMode, no `back`), e2e/live.yaml (toolbar-menu -> new Home/Agents path) and give hosts.yaml a demo build.
- Android: cold-start deep link after clearState and the Host form field focus.
notes:
- Backend: the Swift isolated-herdr-backend (start --plugin, then stopped). iOS Device Key line was read from the Maestro hierarchy because the
  simulator pasteboard did not sync. Android used HOST=10.0.2.2 port 47421.
- The native slot directory was already gone when released.
- Evidence: /private/tmp/claude-501/-Users-eaprules/96b69bbe-4c3e-4245-9ae5-f3863fee18ff/scratchpad/rn/evidence/notifications-maestro/
