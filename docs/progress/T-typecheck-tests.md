# T-typecheck-tests: type-check test files in verify-fast and fix what it finds
status: done
branch: worktree-wf_40a85a5f-46a-8
changed: packages/core/tsconfig.tests.json + packages/i18n/tsconfig.tests.json (new), packages/i18n/scripts/xcstrings.d.mts (new, types for the JS converter), package.json scripts of core and i18n (`typecheck:tests`, `test` runs it first), scripts/verify-fast.mjs, 7 core test files + packages/i18n/src/sync.test.ts (type fixes)
tests: `pnpm verify-fast` green in ~3 s; `tsc -p tsconfig.tests.json` clean in core and i18n.
acceptance:
- test files are type-checked: met. Only core and i18n excluded tests from `tsc -b`; ui, ssh and apps/mobile already include theirs (`tsc -b` covers them). The two new tsconfig.tests.json extend the package config, include tests, noEmit.
- verify-fast runs it for changed packages only: met (`core test types`, `i18n test types`, 1-2 s each, in parallel with the other checks).
- pnpm test runs it: met. core and i18n `test` = `pnpm run typecheck:tests && vitest run`.
- every revealed error fixed without `any` or blanket casts: met. 15 core errors (RouteFailure gained `routeId`; error literals typed as TransportError; `.next()` on an AsyncIterable) and 1 i18n (indexed access). One pre-existing `as TransportError` kept in session-lifecycle.test.ts, where the test deliberately iterates kinds that need payloads.
left:
- packages/plugin and packages/relay are plain JS (`node --test`); no type checking applies.
notes:
- No new dependencies; no native rebuild.
