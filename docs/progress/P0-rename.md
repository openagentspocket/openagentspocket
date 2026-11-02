# P0-rename: Rename to OpenAgentsPocket (ADR 0022)
status: done
branch: main
changed: every package.json + import + script + doc that named `@agentico/*` (now `@openagentspocket/*`), pnpm-lock.yaml, apps/mobile/app.json, apps/mobile/assets/images/* (icon, adaptive foreground/background/monochrome, splash-icon, favicon from design/icon; `assets/expo.icon` removed), HomeScreen title, e2e/home.yaml (appId + title), README, CLAUDE.md, LICENSE, docs/roadmap.md, ADR 0001 title
tests: `pnpm test` → core 780/780, i18n 89/89, modules/ssh 24/24, ui 100/100, apps/mobile 2/2, plugin 833/833, relay 138/138; `pnpm verify-fast` green. Maestro `e2e/home.yaml` on the iOS simulator passes (4/4 asserts).
acceptance:
- user-facing name everywhere: met (app name, Home title, README, CLAUDE.md, roadmap, LICENSE). Historical ADR text kept; repo folder and history untouched.
- internal scope renamed in every package and import: met. `agentico-ssh` (native module) deliberately NOT renamed, see notes.
- app.json icon / adaptive icon / splash from design/icon: met (name, slug `openagentspocket`, ids `com.openagentspocket.app`, splash backgroundColor #8E7CFF, imageWidth 160, adaptive backgroundColor #8E7CFF).
- deep-link scheme only together with the plugin's emitter: met by keeping both: `scheme: ["openagentspocket", "agentico"]`; the plugin emitter and its tests are unchanged.
- full pnpm test green: met (above).
- one native build per platform shows the new icon and name: met. `expo prebuild --clean`, iOS build on "agentico-app iPhone 17 Pro", Android build on Pixel_3a; both launch the new Home. Evidence in /private/tmp/claude-501/-Users-eaprules/96b69bbe-4c3e-4245-9ae5-f3863fee18ff/scratchpad/rn/evidence/rename: ios-splash.png, ios-springboard.png, ios-home-app.png, android-launcher.png, android-home-app.png (android-splash.png was taken mid-boot, not useful).
left:
- Home-screen label truncates on both platforms ("OpenAgentsPo..." on iOS, "OpenAgents..." on Android). Resolved after the task: Enzo chose "Agents Pocket" as the display name (ADR 0022); the integrator verifies it fits in the next native check.
- Relay APNs topics still `com.example.agentico` (packages/relay tests + wrangler.toml); change when the Apple Developer account is active, together with the relay deploy config.
- Android prompts for "nearby devices" permission on first launch (existing behavior, not part of this task).
notes:
- `agentico-ssh` kept: the name is spread over the iOS Swift package `AgenticoSSH`, the C target `CAgenticoSSHSupport` (module map), the podspec, the Kotlin package `expo.modules.agenticossh` and class `AgenticoSessionAccess` in com.jcraft.jsch, `requireNativeModule('AgenticoSSH')`, Artifacts checksums/provenance. Not mechanical and risky; internal only, users never see it. Own task if wanted.
- Debug builds need Metro and `adb reverse tcp:8081 tcp:8081` on Android; the first Android launch showed "Unable to load script" until the reverse was in place.
- An untracked empty dir named "[object Promise]/" (with an empty .claude/) appeared in the repo root at 22:41, not from this task; left alone, not committed.
