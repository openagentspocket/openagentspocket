# OpenAgentsPocket (React Native) - start here

Mobile companion for herdr (agent console over SSH). Expo SDK 58, React Native 0.88.1, React 19.3.0,
TypeScript strict, pnpm 11 workspaces. Pre-alpha. Where the work stands: [docs/roadmap.md](docs/roadmap.md)
("Now / RESUME HERE"). Decisions: [docs/decisions](docs/decisions). Behavior spec: [docs/spec/parity.md](docs/spec/parity.md).

## Layout

- `apps/mobile` Expo Router app. Screens compose `packages/ui` primitives and wire state. No logic.
- `packages/core` pure TS (no React Native imports): protocol types, reducers, parsers. Tested with Vitest.
- `packages/ui` tokens + primitives. Tested with jest-expo + React Native Testing Library.
- `packages/plugin`, `packages/relay` Node, Apache-2.0 (Heeler). `node --test`.
- `modules/ssh` SSH Expo Module: TS interface, client and fake; iOS native wraps libssh2, Android uses JSch. See its README.
- `ios/` and `android/` are generated (CNG) and gitignored. Never edit or commit them.

## The gates

- `pnpm verify-fast`: typed routes (regenerated from `src/app`), biome, `tsc -b`, `gen:check`, file-length ratchet, theme-literal rule, then only the tests
  related to changed files (plugin/relay suites run only when touched; plugin takes ~50 s). Run before every report
  and commit. The pre-commit hook runs it.
- `pnpm test`: every unit/component test. Once per run, by the integrator.
- `pnpm gen`: regenerate protocol types and theme tokens. Never hand-edit `*.generated.ts`.
- Maestro flows in `e2e/`, run by the integrator on the shared simulator/emulator.

## Which checks, when

| Change | Run |
|---|---|
| Any change | `pnpm verify-fast` (seconds) |
| Docs only | nothing more |
| `packages/core`, `packages/ui`, `apps/mobile` JS | verify-fast (related tests) while iterating; one `pnpm test` before merging |
| `packages/plugin`, `packages/relay` | verify-fast runs their suites |
| A screen's look | a Maestro flow with a screenshot, by the integrator |
| Native deps, config plugins, `app.json` native fields | integrator only: `npx expo prebuild --clean` then rebuild native once per batch (a stale `ios/` silently skips modules) |

## Rules

- Reuse first: search `packages/ui` exports before writing any UI. Add a primitive there if a second screen needs it.
- Screens (`apps/mobile/src/app/**`, `*Screen.tsx`) stay at 150 lines or fewer; any file at 400 or fewer (ratchet:
  `scripts/file-length-baseline.json` may only shrink; run `node scripts/check-file-length.mjs --update` after a split).
- Colors only from theme tokens (`useTheme()`); no hex/rgb literal in app or UI source.
- Tests pin behavior, not copy: assert a key resolves or a reducer output, never an exact sentence. Snapshots only tiny.
- Never copy GPL code (for example agentbox, GPL-3.0). Ideas are fine, code is not.
- Agents never run native builds (`expo run:*`, `prebuild`, `pod install`, Gradle). Work in JS; ask the integrator.
- Commits: English, small, no attribution trailers (`Co-Authored-By`, "Generated with"); the commit-msg hook rejects them.
- No personal infrastructure, hostnames, IPs or account ids anywhere. Docs say "your Host".
- Expo APIs change per SDK: check https://docs.expo.dev/versions/v58.0.0/ before using one; install native-ish deps
  with `npx expo install`.
