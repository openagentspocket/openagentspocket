# Decisions

One short ADR per founding decision. Add a new numbered file for any decision that is hard to reverse or surprising.

- [0001](./0001-rewrite-in-react-native.md) Rebuild Agentico (now OpenAgentsPocket) in React Native + Expo
- [0002](./0002-monorepo.md) One monorepo: app, plugin, relay, schema
- [0003](./0003-open-source-licenses.md) Open source: MIT, with Apache-2.0 for the Heeler-derived packages
- [0004](./0004-no-embedded-overlay-networks.md) Drop embedded overlay networks
- [0005](./0005-delivery-order.md) Seven phases, in this order
- [0006](./0006-new-screens.md) New screens: Focus mode, overview board, two-line summaries
- [0007](./0007-visual-direction.md) Visual direction: Índigo, Papel, Noche
- [0008](./0008-local-builds.md) Local native builds, store uploads included
- [0009](./0009-expo-sdk-58.md) Expo SDK 58, New Architecture only, Expo Router
- [0010](./0010-pnpm-workspaces.md) pnpm workspaces with isolated installs
- [0011](./0011-state.md) Zustand per Host, fed by pure reducers; TanStack Query for request/response only
- [0012](./0012-styling.md) Plain StyleSheet with a theme hook
- [0013](./0013-lists-i18n-charts.md) FlashList v2, English + Spanish with ICU plurals, gifted-charts
- [0014](./0014-tooling.md) Biome 2, tsc -b, ratchets, codegen with --check
- [0015](./0015-testing.md) Vitest for core, jest-expo + RNTL for UI, Maestro for E2E
- [0016](./0016-ssh-module.md) SSH: our own Expo Module with six primitives
- [0017](./0017-terminal.md) Terminal: expo-libghostty, fallback xterm.js
- [0018](./0018-ios-extensions.md) iOS extensions via @bacons/apple-targets; Android widgets via expo-widgets
- [0019](./0019-push.md) Push: raw device tokens, end-to-end encrypted payloads
- [0020](./0020-build-speed.md) Native code is rebuilt in batches; ios/ and android/ are generated
- [0021](./0021-agent-workflow.md) How agents work in this repo
- [0023](./0023-terminal-renderer.md) Terminal renderer: expo-libghostty, with the SSH backpressure and ordering fixes the spike found
- [0025](./0025-usage-providers.md) Usage providers: one registry, one collector per provider
- [0026](./0026-sheets.md) Sheets: one look, one sizing rule, two hosts
- [0027](./0027-session-backends.md) Session backends: herdr, tmux and what comes next
- [0028](./0028-over-the-air-updates.md) Over-the-air JS updates: expo-updates, a signed static server on our Cloudflare account (proposed)
