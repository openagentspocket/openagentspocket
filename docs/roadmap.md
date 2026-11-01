# Roadmap

Living document: update it at every step so any agent can resume from it.

## Now / RESUME HERE

State (2026-11-01): scaffold done and verified. Next is **phase 1, starting with the SSH spike gate**.

- Versions: Expo SDK 58 (`expo ~58.0.22`, expo-router `~58.0.29`), React Native 0.88.1, React 19.3.0,
  TypeScript ~6.0.3, pnpm 11.9.0, Node 22, Biome 2.6.4, Vitest 5.0.5, Jest 30.5.2 + jest-expo 58.0.13,
  RNTL 14.1.0, json-schema-to-typescript 16.0.0. React/RN pinned in `pnpm-workspace.yaml` overrides.
- Works: `pnpm verify-fast` (about 3 s; plugin suite adds ~50 s when `packages/plugin` changes), `pnpm test`
  (core 4, ui 12, mobile 1, ssh 4, relay 90, plugin 814 pass / 0 fail), `pnpm tsc -b`, `pnpm gen:check`.
- Native: one iOS simulator build (`expo run:ios`) and one Android emulator build (`expo run:android`) of the
  themed Home on demo data both ran; Maestro `e2e/home.yaml` passes on iOS.
- Commands: `pnpm -F @agentico/mobile ios` / `android` (native build, integrator only), `pnpm e2e:ios`
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

- Plugin/relay: legacy Heeler relay URLs stay in `notification-config.js` on purpose (migration of old configs).
- `ThemeProvider` follows the system appearance (light: Papel, dark: Índigo); no in-app theme setting yet.
- App icon and splash are still the Expo template's; Índigo variants pending a design pass.
- `apps/mobile/app.json` uses placeholder ids `com.example.agentico`.
