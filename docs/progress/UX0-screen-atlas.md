# UX0-screen-atlas: Screen atlas (Swift | RN) for the UX parity program
status: partial
branch: worktree-wf_b9cc74f4-d7b-1
changed: apps/mobile/src/app/__atlas/**, apps/mobile/src/app/_layout.tsx, apps/mobile/src/dev/atlas/**, apps/mobile/src/dev/web/**, apps/mobile/metro.config.js, apps/mobile/tsconfig.json, scripts/atlas-{lib,web,ios}.mjs, scripts/atlas-compare.py, docs/tasks.yml, docs/agents/swarm.md, docs/ux/rn-gap.md
tests: pnpm verify-fast → green (atlas registry test 2/2)
acceptance:
- /__atlas and /__atlas/<id>, fixed clock, demo data: met (22 ids: 21 Swift ids + rn.board; `entries.tsx` + `atlasMap.json`, kept equal by a test). 151 Swift ids have no RN screen (`design/atlas/compare/unmapped.txt`).
- Renders on Expo web: met. Web-only Metro resolver stubs for `expo-sqlite/kv-store` and `expo-file-system` (other native modules are lazy or already degrade on web; PlainTerminal is used for the terminal). `node scripts/atlas-web.mjs` captured all 22 ids, indigo and papel, 402x874 @3x, into design/atlas/rn-web.
- atlas-ios.mjs: written and run end to end (boots the sim, Metro on 8081, launch, deep link `openagentspocket://__atlas/<id>`, simctl screenshot). NOT met for usable output: the installed Debug build is stale and dies with "Cannot find native module 'ExpoCrypto'", so every rn-ios capture was the red box (deleted). Needs a rebuild by the integrator, then one run.
- atlas-compare.py: met. design/atlas/compare/<id>[.papel].png + index.html + unmapped.txt; 19 of 22 have a Swift shot (usage.limits-page, browser.ports, rn.board have none).
- docs/ux/rn-gap.md and swarm.md "UX loop": met.
left:
- Rebuild the dev client (stale: ExpoCrypto missing) and run `node scripts/atlas-ios.mjs --udid <udid>` once, in indigo and papel.
- Atlas entries for the other 151 Swift ids as the UX tasks build those screens (each task adds its row).
- changes.file-diff has no selected file in the atlas (shows the empty state); hosts.detail shows the Trust prompt because the demo probe asks on first connect.
- Swift shots for usage.limits-page and browser.ports are missing in the Swift atlas runs; the Swift iPhone atlas run itself is only partly generated (most Swift shots come from lead-qa / design/screens/current, which predate the Índigo skin).
notes:
- Swift reference path is found automatically (`../Agentico` or from a worktree `../../../../Agentico`); override with SWIFT_REPO.
- Expo's web dev toast (`#error-toast`, React DOM prop warnings) is hidden by CSS injected by atlas-web.mjs before each capture.
- `Date.now` is pinned in the atlas layout (`freezeAtlasClock`); relative times therefore read "now" until the demo data carries distinct ages (noted in rn-gap.md).
- `apps/mobile/metro.config.js` is new: Expo defaults plus the web stub resolver; native platforms are unaffected.
