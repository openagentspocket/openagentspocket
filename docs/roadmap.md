# Roadmap

Living document: update it at every step so any agent can resume from it.

## Now / RESUME HERE

**2026-11-07 night:** Live Activity shows Approve and Deny while the app has read the ask, on herdr and tmux. A button is a link that only opens a sheet in the app with the prompt read from the Host; a tap there runs the gates, and Approve asks for the owner. Nothing runs under App Lock. A push from the Host carries no ask yet, so a suspended app shows no buttons and a push clears drawn ones. A refused key prompt stands until Retry. Message Jump ignores spinners and knows Composer messages. Not proved on a device. The iPhone has Release 29c14a8. `sim:verify` failing bare on its first flow was Maestro's driver start on a simulator just booted: the script now waits longer.

**2026-11-07 Live Activity actions:** Approve and Deny on the Live Activity, herdr and tmux. While an Agent of a Host with both toggles on is Blocked, `ApprovalAskWatch` reads `approval-asks.js` (7 s after the turn, every 20 s, a `HostDataSource`). A button is a link (`agentico://agent/<host>/<pane>?answer=&bid=`): iOS gives an intent no safe background time, so it opens the app like a notification action. `ActivityTapRunner` reads the Host again, takes the prompt only from that read, then TTL, Approve rules, device owner authentication, ledger, `applyApproval`. `approval-opt-in.json` now reaches the App Group, or the widget drew nothing. Open: not proven on a device; a Host push carries no `ask`, so a suspended app shows no buttons (activity hook, Swift's M5); a named session without an endpoint is left out (no socket for the scripts).

**2026-11-07 late:** a reconnect away from the app holds the key prompt until the return; an interrupted prompt is no refusal; Jump Host closes its hop on any failure. Message Jump is in the terminal menu on herdr; off on tmux, where the wheel means copy-mode. tmux hooks record the Live Activity ask, but no app code reads asks on either backend yet: Live Activity shows no buttons. Unifying `BlockedCard` and `LimitWindowRow` waits in [a PR](https://github.com/openagentspocket/openagentspocket/pull/1) for the owner's look. Full test and all 13 flows green; the iPhone has Release dcecba1.

**2026-11-07:** the plan in [docs/superpowers/plans/2026-11-06-rest-of-roadmap.md](superpowers/plans/2026-11-06-rest-of-roadmap.md) ran to its end. Done: connections survive 15 s away from the app, Require Face ID for SSH Keys asks (`KeyAccessGate`), Jump Host connects over a local forward, Board has an entry point, open tool rows show output, diffs and images, rows copy on long press, Select Text and Attach Links, notifications for Pi, Oh My Pi and Grok Build on tmux, Approve on tmux (proved in the lab with a real Claude Code prompt), Hermes segments across compression, View Content for skills, dictation, drawing on a photo. Coverage per Agent: [guides/agent-coverage.md](guides/agent-coverage.md). Full test green, all 13 `pnpm sim:verify` flows green on the new native build. What needs the owner closes the plan.

**2026-11-06 night:** main bd876cb plus this note, on the iPhone. Done today: Host scope, every control from `Tappable`, alerts over sheet routes, context menus at the touch, crash capture, Approve/Deny from a notification (opens the app), Hermes Chat with read-only session discovery. Not proven on a device: Approve/Deny, Hermes Chat on a real Hermes. Gaps against the Swift app: [swift-gap.md](swift-gap.md). Proposed next, waiting for Enzo: quick fixes (15 s background grace, key lock toggle, Jump Host, a link to Board), then Chat rows, then a native background approval runner; Mosh after.

**2026-11-06 ~17:20 ART:** Chat reads Hermes Agent (`packages/core/src/chat/hermes`): messages, tool calls and results, reasoning, older pages, from `state.db` over the shared store reader `chat/store` (extracted from OpenCode; `ChatHostFiles.queryStore`). The store is the default one or the open profile's that holds the session. Send goes only into an idle box read from Hermes's source; no Blocked card; the tool-call path is proven on synthetic rows only, and a compression rotation shows only the newest segment.

**2026-11-06 ~01:50 ART:** one Host scope for Home, Agents and Terminals: a nav bar capsule (`HostScopeMenu`, `useHostScope`) with two or more Hosts; New Agent and New Terminal open on it. `herdr plugin install openagentspocket/openagentspocket --ref plugin` and `https://openagentspocket.com/install.sh` work now. The `plugin` branch is generated: after a plugin change run `git subtree split --prefix=packages/plugin -b plugin` and push it (no force). Pairing installs herdr's integration per program: without it an Agent reports no session and Chat stays on Waiting for Conversation; an Agent already running must restart to report it.

**2026-11-05 ~17:15 ART:** main 23ac09d on origin (openagentspocket/openagentspocket, public). Add Host freeze fixed; `useHandoverSheet` at the seven sheets that closed and navigated; full test green; all 8 `pnpm sim:verify` flows green (one run lost the simulator itself after flow 08, no app crash, not explained). iPhone has Release f63d65f. `ProgramDefinition` merged (`packages/core/src/chat/programs`), locate and the no-session copy included; a program Chat cannot read says so. `packages/session-bridge` maps tmux to the session protocol, tested on a real tmux 3.8. Program hooks notify for Claude Code (`packages/plugin/src/program-hook.js`). A tmux Host works end to end on a real iPhone (2026-11-06): real Claude Code in tmux, push through APNs, tap opens the Agent, its Chat reads. Open: approve from a notification, Codex and OpenCode hooks fired for real (OpenCode runs as a service, whose plugins see no `TMUX_PANE`), Hermes Chat, voice, image annotation, component twins.

**2026-11-05 ~15:45 ART restart:** main 5be8d96; iPhone has Release 6ae2d5c. Open: Add Host freezes the app (TrueSheet over the /add-host transparentModal; fix = plain Sheet, no route), settings-fixes pending, full test not run since 9c49a54. Full lead state: the lead's private session handoff. Next: fix, all 8 `pnpm sim:verify` flows green, then install; full test; native-first; component dedup audit + jscpd ratchet.

State (2026-11-02 ~16:00): wave 5 fully merged (incl. P1.12 SSH auth: password, RSA, bootstrap seed; P4.3b ports
native config). UX phase A (atlas tooling + briefs) and B (UX1-design-system primitives, T-verify-fixes-w4 functional
fixes, dev client rebuild + iOS atlas baseline) merged; full test green (core 2584, mobile 287, ui 158, transport 142,
ssh 33, i18n 94, live-activity 7, plugin 833, relay 138). The complete Swift iPhone atlas is
../Agentico/design/screens/current (138 dark, light/ 131, ipad/ 200).
**UX approach (Enzo, 2026-11-02): component first.** Clone each Swift visual component once (reference crops from the
atlas, side by side in the gallery), reuse it everywhere, then assemble screens and compare whole screens.
UX phase C merged: UX2-component-catalog (58 components in 10 groups, ~160 reference crops in
docs/ux/components/ref, gallery compare harness), T-atlas-redbox (modal presentation set after push remounted
the scene: now static in AppStack), expo-notifications config plugin. The native retry was blocked by a full disk.
UX phase D merged: 8 of 10 component groups approved on Swift | RN sheets (agent rows, home shell, chat rows,
blocked + terminal, nav + sheets, usage, hosts/settings/files, settings pickers); ui tests 252. Native retry: both
platforms build; Android deep link with the app open passes; notification permission still not requested (demo
push token source), e2e flows outdated for the new Home.
UX phase E merged what the judges approved: UX3-composer-extras (round 2), UX1-settings, UX1-hosts (+ sheet
routes, keyboard avoiding + pinned sheet bar in Screen), UX1-menu-preview, T-e2e-w5 (real push permission, e2e flows,
Android cold-start link, port field); ui 265, mobile 301. Rejected on stale evidence or real gaps: UX1-home,
UX1-agents-list, UX1-usage, UX1-notifications, UX3-agent-bar.
UX phase F merged: UX3-agent-bar, UX1-home and UX1-usage approved after the judges regenerated the sheets
themselves (round 3); ui 275, mobile 307. Lesson: workers passed atlas ids as one quoted string (nothing captured,
old PNGs reused) and Metro served stale code: fresh server + cleared cache + separate ids + judge regeneration.
UX phase G: UX1-agents-list approved (round 4) and merged; the weekly usage limit cut the rest (2026-11-02,
reset 2026-11-05). Lighter waves since (Enzo, 2026-11-05): 2-3 standalone agents (feedback by SendMessage, no fresh
fix agents), Enzo reviews the compare sheets himself, max 2 iterations per screen, one atlas file per family
(apps/mobile/src/dev/atlas/family*.tsx), one-page brief docs/agents/ux-worker.md, haiku for mechanical steps.
Enzo reviewed the compare sheets himself (2026-11-05: "está todo perfecto, me encanta"): UX1-agent-detail,
UX1-files-changes-ports and UX1-new-agent merged (ui 276, mobile 312, full test green).
2026-11-05: UX1-notifications, UX1-console, UX1-settings-pages, P2.11 background work, P2.15 git status line and
P2.10 chat for Pi/OMP/Grok/OpenCode merged (full test green: core 3499, ui 283, mobile 321). iPhone screen parity
123/138 (13 dropped by decision). Home's Add Host opens Scan to Pair; Scan to Pair explains how to show the code.
Apple Developer, Firebase project and the hosted relay are live (owner values stay in gitignored local files read
by apps/mobile/app.config.js and packages/relay/scripts/deploy.mjs); the app runs on the owner's iPhone.
**Running (standalone agents):** P2.10b send policy + composer "+" menus; tint audit + "Agent gone" on resume;
screen scaffold (safe area fixed once in Screen, one scaffold for every screen, native menu trigger icon); P4.1e
generic usage providers (cards per provider, plugin collectors); UX1-easy-pair (ChoiceSheet, CommandBlock, Easy
Pair screen, install.sh / install.ps1). Next: merge each after Enzo's review, iOS simulator + Maestro pass, domain on
Cloudflare (relay.openagentspocket.com, site with /privacy and /install.sh, privacy@ routing), iPad last. Full
lead handoff (agents, accounts, merge procedure): the lead's private session handoff.

Enzo decision (2026-11-05): extra Swift app themes (Catppuccin Mocha, Gruvbox Dark, Nord) only as terminal palettes; the
app keeps Índigo, Papel, Noche.

Lead decisions while Enzo sleeps: xterm.js comparison removed after ADR 0023 (its generated bundle broke fresh
checkouts); RNTL async timeout 5 s (first renders under the parallel suite); agent-source adapter dropped in
favor of the console store; ChatProgram lives in chat/model only; RN-only strings live in
packages/i18n/src/extras (the merge script moves keys a branch adds to the generated catalogs there); the merge
script now merges with --no-commit so the pre-commit gate runs on every merge.

Lead's integration loop per wave: merge each ship branch with `scratchpad/rn/merge-branch.sh <branch>` (resolves
PROGRESS.md, index.ts export unions, package.json unions and the lockfile; stops on real conflicts), `pnpm test`,
a native-verify agent (`prebuild --clean`, both platforms, SSH harness, Maestro), remove merged worktrees, update
this section, plan the next wave from PROGRESS.md's ready tasks.

Integration lessons (wave 2): Expo writes typed routes only when Metro starts, so main had stale routes and
fresh worktrees had none: verify-fast regenerates them; a branch built before T-typecheck-tests landed failed
the new test-type gate at merge (rebase old branches on main first); app.json plugin lists conflict on every
native task: resolve by union; core must never import modules/ssh (rootDir): ports in core, adapters outside.

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
