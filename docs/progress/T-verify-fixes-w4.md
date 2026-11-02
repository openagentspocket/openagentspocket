# T-verify-fixes-w4: Fixes from the end-to-end check
status: done
branch: see git (worktree branch)
changed: e2e/{live,hosts,home}.yaml, docs/e2e-live-backend.md, docs/tasks.yml, apps/mobile/src/connections/{trustPrompt,ConnectionManager,liveServices,deviceServices,connections.test}.ts, apps/mobile/src/features/hosts/{DeviceKeyLine,AuthFields,HostListScreen,hostRows,hostsRuntime,useHostChecks,hosts.test}, apps/mobile/src/home/HomeScreen.tsx, apps/mobile/src/links/{nativeIntent,useIncomingLinks}*, apps/mobile/src/app/_layout.tsx, apps/mobile/src/notifications/devicePushToken*, apps/mobile/src/agent-detail/terminal/attachOutput.test.tsx, apps/mobile/package.json (expo-notifications)
tests: pnpm verify-fast -> green
acceptance:
- (1) Maestro: hideKeyboard replaced by tap "Routes" + scrollUntilVisible; route-0-port set; live.yaml has no env defaults; report-agent step documented in docs/e2e-live-backend.md; home.yaml switches Demo Mode on through Settings: met (flows not run, integrator)
- (2) One Trust prompt: TrustPromptQueue shares an in-flight or just-settled answer per host:port:fingerprint; the Hosts runtime exposes it and useHostChecks uses it: met (connections.test.ts)
- (3) DeviceKeyLine in the Host form (Copy authorized_keys Line); isolated-backend authorization documented: met (hosts.test.tsx)
- (4) Host title falls back to the address, subtitle stays user@address; the Console store carries the same name so Home has no empty name or stray colon: met (hosts.test.tsx, connections.test.ts)
- (5) Stale Home/Agents: setActive ran background and foreground concurrently, the resume read a not-yet-suspended status, took the revalidate path and the Host then settled on suspended (Home Offline, Agents still listing cached rows). Transitions are now serialized: met (connections.test.ts, fails without the fix)
- (6) Android deep link while running: redirectLink now maps plain screen links of ours (openagentspocket:///hosts) instead of sending them Home; useIncomingLinks routes URLs received while running: met in unit tests (not verified on a device)
- (7) Terminal attach: tests write to the PTY fake before and after layout and assert the text reaches TerminalView; the JS path is sound. The empty panel for an idle shell is most likely a PTY that sends nothing until the next output: not reproduced, needs a live check
- (8) Notification permission: createDevicePushTokenSource asks the OS in enable() (after the Settings explainer, before Host rows appear), creates the Android channel, returns denied/registered; wired into the live notification services: met (devicePushToken.test.ts)
left:
- Integrator: expo-notifications was added with `expo install`; add it to app.json plugins if needed, prebuild and rebuild native once, then verify on device: permission prompt, token registration, a push showing
- Integrator: run the three Maestro flows; check the Android deep link and the idle-shell terminal live
- Possible task: if the idle terminal stays blank, force a redraw after attach (window-change / Ctrl-L)
notes: Swift displayName (user@address) is pinned by goldens, so the fallback lives in the app (`hostTitle`), not in core.
