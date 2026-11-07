# OpenAgentsPocket (React Native) - start here

Mobile companion for herdr (agent console over SSH). Expo SDK 58, React Native 0.88.1, React 19.3.0,
TypeScript strict, pnpm 11 workspaces. Pre-alpha. Where the work stands: [docs/roadmap.md](docs/roadmap.md)
("Now / RESUME HERE"). Decisions: [docs/decisions](docs/decisions). Behavior spec: [docs/spec/parity.md](docs/spec/parity.md).

## Layout

- `apps/mobile` Expo Router app. Screens compose `packages/ui` primitives and wire state. No logic.
- `packages/core` pure TS (no React Native imports): protocol types, reducers, parsers. Tested with Vitest.
- `packages/ui` tokens + primitives. Tested with jest-expo + React Native Testing Library.
- `packages/plugin`, `packages/relay` Node, Apache-2.0 (Heeler). `node --test`.
- `packages/session-bridge` answers the session protocol over tmux on the Host (ADR 0027). Vitest.
- `modules/ssh` SSH Expo Module: TS interface, client and fake; iOS native wraps libssh2, Android uses JSch. See its README.
- `ios/` and `android/` are generated (CNG) and gitignored. Never edit or commit them.

## The gates

- `pnpm verify-fast`: typed routes (regenerated from `src/app`), biome, `tsc -b`, `gen:check`, file-length ratchet, theme-literal rule, then only the tests
  related to changed files (plugin/relay suites run only when touched; plugin takes ~50 s). Run before every report
  and commit. The pre-commit hook runs it.
- `pnpm test`: every unit/component test. Only the lead, only at a milestone (a wave closed, before a device
  install or a release), never per task: workers never run it, and a merge relies on verify-fast's related tests.
- `pnpm gen`: regenerate protocol types and theme tokens. Never hand-edit `*.generated.ts`.
- Maestro flows in `e2e/`, run by the integrator on the shared simulator/emulator.

## Which checks, when

| Change | Run |
|---|---|
| Any change | `pnpm verify-fast` (seconds) |
| Docs only | nothing more |
| `packages/core`, `packages/ui`, `apps/mobile` JS | verify-fast (related tests); the merge commit reruns it over the whole branch diff |
| `packages/plugin`, `packages/relay`, `apps/site` | verify-fast runs their suites |
| A milestone (wave closed, device install, release) | the lead runs `pnpm test` once |
| A visual or navigation change | `pnpm sim:verify <flow...>` for the affected flows (e2e/sim, demo mode, simulator 2798C301, takes the native slot) before reporting; the report lists the screenshots in `design/atlas/sim/`. The web atlas is support, not proof |
| Native deps, config plugins, `app.json` native fields | integrator only: `npx expo prebuild --clean` then rebuild native once per batch (a stale `ios/` silently skips modules) |

## Rules

- Reuse first: search `packages/ui` exports before writing any UI. Add a primitive there if a second screen needs it.

## Reusable by default (Enzo, 2026-11-05: for everything that comes)

Build the generic piece once and extend it, so a similar feature tomorrow is quick and safe and an edit to a pattern
changes it everywhere. Judges reject duplication.

- Find the extension point first and plug into it; if none exists and a second use is plausible, create it first and
  ship the feature as its first implementation. Existing ones: a Chat program is one name in `CHAT_PROGRAMS` and one `ProgramDefinition`
  (`packages/core/src/chat/programs`: adapter, locate, send policy, session naming, Blocked support), no UI branches; Host data is a `HostDataSource` (`packages/core/src/hosts/host-data.ts`: script, parser, refresh) read with `useHostData`,
  not ad hoc exec calls; screens compose `packages/ui/src/components`;
  layout differences (iPad, wide) go through `useLayoutMode` and layout components, never per-screen forks;
  every control's tint comes from tokens through shared wrappers.
- Variants are props of one component, never copies. A pattern used twice becomes a component or a helper in the
  package the next caller would search.
- Shared fakes and fixtures for tests live next to the interface they fake.
- In a report, list the reusable pieces you created or extended.
- Screens (`apps/mobile/src/app/**`, `*Screen.tsx`) stay at 150 lines or fewer; any file at 400 or fewer (ratchet:
  `scripts/file-length-baseline.json` may only shrink; run `node scripts/check-file-length.mjs --update` after a split).
- Every control starts from `Button` (`ActionMenuButton` for a menu); a row or card from `Tappable`, the base `Button` is built on. `scripts/check-raw-pressable.mjs` rejects anything else. A card starts from `Card` and every ui component needs a caller: `scripts/check-reuse.mjs` rejects a hand-drawn card radius and an unused component (its PENDING list may only shrink).
- Colors only from theme tokens (`useTheme()`); no hex/rgb literal in app or UI source.
- Strings through `t()`. A string the Swift catalogs lack goes in `packages/i18n/src/extras/{en,es}.json` (both
  languages); never edit `packages/i18n/src/catalogs/*` (regenerated from Swift, pinned by the sync test).
- Tests pin behavior, not copy: assert a key resolves or a reducer output, never an exact sentence. Snapshots only tiny.
- Never copy GPL code (for example agentbox, GPL-3.0). Ideas are fine, code is not.
- Agents never run native builds (`expo run:*`, `prebuild`, `pod install`, Gradle). Work in JS; ask the integrator.
- Commits: English, small, no attribution trailers (`Co-Authored-By`, "Generated with"); the commit-msg hook rejects them.
- No personal infrastructure, hostnames, IPs or account ids anywhere. Docs say "your Host".
- Expo APIs change per SDK: check https://docs.expo.dev/versions/v58.0.0/ before using one; install native-ish deps
  with `npx expo install`.
