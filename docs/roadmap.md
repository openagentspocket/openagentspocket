# Roadmap

Living document: update it at every step so any agent can resume from it.

## Now / RESUME HERE

State (2026-11-01 ~23:30): **wave 1 complete on main** (10/10 tasks; 9 of 55 done: ui primitives is partial,
its leftovers filed as tasks). Native check of main (`fed475e`): iOS and Android build, the SSH harness passes
17/17 on both (herdr ping protocol 22, snapshot, >1 MiB, PTY + resize, SFTP, direct-tcpip), Maestro home passes on
iOS. Goldens from the Swift reference landed in `packages/core/goldens` (Swift branch `goldens` merges with run 13).
P0-rename done (scope `@openagentspocket/*`, ids `com.openagentspocket.app`, icon + splash; both platforms build;
the home-screen label truncates: short display name pending Enzo). **Running:** wave 2 (workflow `wf_40a85a5f-46a`,
base `a0c86f2`): 7 JS (P2.1 console + open-union enums, P4.1 usage, P4.5 settings, P4.4 changes, P4.2 files,
P5.2 registration, T-typecheck-tests) + native chain (P0-qr-scanner → P0-brand-marks → P3.0 terminal spike).
If the session dies: resume with `Workflow({scriptPath: scratchpad/rn/wave2.js, resumeFromRunId: "wf_40a85a5f-46a"})`. Evidence: scratchpad `rn/evidence/main-wave1/`.

Lead's integration loop per wave: merge each ship branch with `scratchpad/rn/merge-branch.sh <branch>` (resolves
PROGRESS.md, index.ts export unions, package.json unions and the lockfile; stops on real conflicts), `pnpm test`,
a native-verify agent (`prebuild --clean`, both platforms, SSH harness, Maestro), remove merged worktrees, update
this section, plan the next wave from PROGRESS.md's ready tasks.

Integration lessons (wave 1): a stale generated `ios/` (old deployment target) silently skipped the SSH module:
`prebuild --clean` after native config changes; parallel tasks redefined shared types (RouteFailure, Clock, herdr event types) →
wave briefs now name the existing modules to reuse; generated/union files (PROGRESS.md, index.ts export lists,
package.json deps, pnpm-lock) are resolved mechanically by the lead's merge script.

How the swarm works: [docs/agents/swarm.md](agents/swarm.md). What is done and left: [docs/PROGRESS.md](PROGRESS.md)
(generated from [docs/tasks.yml](tasks.yml) + `docs/progress/*.md`).

Scaffold facts:


- Versions: Expo SDK 58 (`expo ~58.0.22`, expo-router `~58.0.29`), React Native 0.88.1, React 19.3.0,
  TypeScript ~6.0.3, pnpm 11.9.0, Node 22, Biome 2.6.4, Vitest 5.0.5, Jest 30.5.2 + jest-expo 58.0.13,
  RNTL 14.1.0, json-schema-to-typescript 16.0.0. React/RN pinned in `pnpm-workspace.yaml` overrides.
- Works: `pnpm verify-fast` (about 3 s; plugin suite adds ~50 s when `packages/plugin` changes), `pnpm test`
  (core 4, ui 12, mobile 1, ssh 4, relay 90, plugin 814 pass / 0 fail), `pnpm tsc -b`, `pnpm gen:check`.
- Native: one iOS simulator build (`expo run:ios`) and one Android emulator build (`expo run:android`) of the
  themed Home on demo data both ran; Maestro `e2e/home.yaml` passes on iOS.
- Commands: `pnpm -F @openagentspocket/mobile ios` / `android` (native build, integrator only), `pnpm e2e:ios`
  (needs `~/.maestro/bin` on PATH and one booted simulator; use `maestro --device <udid> test e2e/home.yaml`).
- Gotchas found:
  - pnpm 11 fails `install` on unreviewed build scripts: `allowBuilds` in `pnpm-workspace.yaml` lists them.
  - iPhone 17 Pro cannot be created on the iOS 27.1 runtime (`Incompatible device`); the repo's simulator
    uses iOS 26.5. Xcode here is 27.2.
  - Biome 2.6 formats Markdown; `**/*.md` is excluded in `biome.json`.
  - Maestro matches the section header by its combined accessibility label: assert `"NEEDS YOU.*"`.
  - The plugin test suite reads `packages/plugin/package-lock.json`; keep it.
  - `modules/ssh` has no `expo-module.config.json` on purpose (autolinking would look for native code).

### Next

1. SSH spike gate: prove `direct-streamlocal` to herdr's socket on iOS (wrap the libssh2 package) and Android
   (JSch mwiede fork). Fill `modules/ssh` native code; keep `FakeSsh` in sync with the interface.
2. Hosts screen + pairing (QR from `packages/plugin`) on top of the SSH module.
3. Replace `FakeTransport` in `apps/mobile/src/home/useAgents.ts` with the real transport; add per-Host Zustand
   store fed by reducers in `packages/core`.
4. Add Knip and jscpd to a `verify-full` gate; add the fingerprint guard for native changes; i18n (en + es).
5. Export golden JSON from the Swift parsers to diff-test the TS ports.

## Phases

1. Hosts + pairing + SSH transport (starts with the SSH spike gate)
2. Agents, Inbox, Chat, approvals; plus Focus mode, overview board, two-line summaries
3. Terminal
4. Usage, Files, Ports, Settings
5. Notifications (APNs + FCM)
6. Live Activities, widgets, Watch, Siri (native Swift targets inside Expo)
7. ACP (Agent Client Protocol) through the plugin, spiked with fx

## Done

- Scaffold: workspace, gates and hooks, core (generated protocol types, agent sorting), ui (3 themes, 7
  primitives), plugin and relay (Apache-2.0, NOTICE), ssh interface + fake, themed Home, docs, ADRs, parity spec.

## Open issues

- Name (2026-11-01, ADR 0022): the app is **OpenAgentsPocket**. Domain `openagentspocket.com` registered by Enzo
  (2026-11-01); planned: DNS on Cloudflare, landing + `/privacy` on Cloudflare Pages, relay on
  `relay.openagentspocket.com`. Enzo creates the GitHub org himself. Internal rename done (P0-rename): workspace scope `@openagentspocket/*`, bundle/package id `com.openagentspocket.app`, schemes `openagentspocket` + legacy `agentico` (the plugin and the Swift app still emit `agentico://`); `agentico-ssh` keeps its name (native module, Swift/Kotlin/C identifiers; renaming is not mechanical). Icon and splash from `design/icon`.

- Stores (2026-11-01): Apple Developer Program (Individual) paid by Enzo, enrollment processing (up to 2 business
  days); then he sends the Team ID, accepts the agreements, creates the APNs `.p8` himself. Google Play: his 2024
  account was closed for inactivity; he creates a new one (US$25) once the app is further along. New personal
  Play accounts need a closed test with 12 testers for 14 days before production: start it with the first usable
  build. Firebase (FCM) project in phase 5; the service-account key is set by Enzo as a relay secret.

- Plugin/relay: legacy Heeler relay URLs stay in `notification-config.js` on purpose (migration of old configs).
- `ThemeProvider` follows the system appearance (light: Papel, dark: Índigo); no in-app theme setting yet.
- `apps/mobile/app.json` uses `com.openagentspocket.app` (the project owns openagentspocket.com); the relay still has `com.example.agentico` APNs topics until the Apple Developer account is active.
