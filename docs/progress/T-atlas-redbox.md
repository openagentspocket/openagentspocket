# T-atlas-redbox: atlas iOS "Maximum update depth exceeded"
status: partial
branch: worktree-wf_057d2888-9cf-2
changed: scripts/atlas-ios.mjs, docs/tasks.yml, docs/progress/T-atlas-redbox.md
tests: pnpm verify-fast → see commit
acceptance:
- Reproduce: NOT met. On Expo web, 5 ids opened client-side in one tab (shell.home, console.agents-list-flat, console.start-agent, hosts.list, hosts.form, history.pushState + popstate) rendered every screen with no error, so the loop is native-only. The iOS repro was blocked: the machine disk was full (229-280 MiB free, ENOSPC even for the tool's temp files), the simulator could not be booted nor Metro started. Native slot released, simulator untouched.
- Root cause + fix + regression test: NOT met (no repro, so no claim is made).
- atlas-ios.mjs relaunches per id: met in code (terminate, launch, wait, deep link, screenshot for every id; `--launch-wait` ms, default 8000, 15000 for the first). Not run (no disk).
left:
- Free disk, take the native slot, boot the sim, run `node scripts/atlas-ios.mjs --udid <udid> console.agents-list-flat console.start-agent hosts.list`.
  To reproduce the loop itself deep link the three ids in ONE session with `xcrun simctl openurl` (no relaunch) and read the red box / Metro log.
notes:
- Suspects to test first, all specific to console.start-agent (the first id to fail): `NewAgentRoute` sets `presentation: 'modal'` through `<Stack.Screen>` after mount on a native-stack screen that is already pushed (the atlas pushes one `[atlasId]` screen per deep link, so the stack grows); `NewAgentScreen` passes a fresh `edges` array to `Screen` -> react-native-safe-area-context `SafeAreaView` every render; `onStarted`/`phase` effect. Unverified hypotheses.
