# UX1-home: assemble Home + Status Inbox from the cloned components
status: done
branch: worktree-wf_308cc08d-920-3
changed: apps/mobile/src/home/** (HomeScreen, HomeChrome, HomeInbox, InboxItem, HomeSessions, HomeHosts, hostCards, homeLabels, useHomeActions, UsageRingSlot now `useUsageRing`; old HostCard, InboxCard, UsageRing removed), apps/mobile/src/app/index.tsx, apps/mobile/src/dev/atlas/** (AtlasActions, offlineHosts, 5 new entries + map rows), apps/mobile/src/app/__atlas/[atlasId].tsx, packages/ui/src/components/{SessionsStrip,LargeTitleBar}.tsx (terminal-colored 132x84 tiles; long title shrinks), e2e/live.yaml
tests: `pnpm verify-fast` green; `jest src/home src/dev` → 32/32
acceptance:
- Large inline title and one trailing glass capsule (ring, gear), no other toolbar buttons: met (LargeTitleBar; toolbar-hosts/menu removed, Agents/Board reached via See all).
- Section order offline lines, Needs you, Working, Done, idle/See all footer, Sessions, Hosts: met (atlas shell.home, shell.home dark and papel).
- Headers sentence case with count capsule; Needs you outline; radius 8; card = mark+status, title, age, 3-line detail, chips: met (ui InboxCard).
- Sessions terminal tiles in a strip bleeding to both edges: met (SessionsStrip, agents only: the RN Console lists no shell tabs).
- + in its own reserved strip, menu order New Agent, New Terminal, Add Host: met (NewStrip + Fab; the Fab is 56 pt in ui, the brief says 58, left).
- Swipes (Pin leading, Close trailing with confirm) and long-press menu (Pin, Close Pane): met. Details is not offered: the quick-detail sheet belongs to UX1-agents-list.
- Two columns at width >= 600 (ColumnRows for inbox and Hosts): met in code, not captured (atlas is 402 wide).
- Skeleton, quiet card, No Hosts with title capsule, Add Host and Setup Guide: met (Setup Guide opens the repository, no guide screen exists).
- Papel: captured for every id, holds.
left:
- console.quick-detail-sheet and console.host-connection-sheet have no RN screen yet (UX1-agents-list, UX1-hosts).
- AX-size stacked header variant and the 58 pt Fab are not verified/changed.
- A shell-tab Sessions source (Swift lists shells next to Agents) once the Console exposes them.
- Host issue lines are keyed by Host name (HostIssue has no id); two Hosts sharing a name open the first.
review-fixes:
- Sessions tiles use the surface fill (visible against the canvas); captions (mark, title, host) were already drawn.
- Section rhythm: Home body no longer adds a bottom pad before Sessions; demo Console has an idle Agent (p5) so the idle line shows.
- Add Host is a capsule (Button `pill`); host issue lines compact (subheadline, 16 pt glyph, 28 pt rows); atlas offline state seeds two Hosts.
- Row menu: Details added (opens the Agent); atlas long-press targets the Working row inbox-p2.
- Inbox card title is subheadline semibold.
- Accepted gaps recorded in docs/ux/rn-gap.md section 3b. Not re-captured (no atlas run).
notes:
- age testID moved to `inbox-<pane>-age` (ui InboxCard); the Home test follows. e2e live.yaml reaches Agents through `home-see-all`.
- Atlas states that need a tap use `AtlasActions` (web DOM click / synthetic mouse hold on a testID); close-confirmation opens the confirm directly (Swift shows it over Agents). `console: 'offline'` seeds a Host that never connects.
- Expo dev server did not pick up edits in the worktree reliably: restart it (atlas-web without --no-server) before the final capture.
- Evidence sheets: scratchpad rn/evidence/UX1-home/ (dark and .papel for shell.home, shell.home-new-menu, console.row-context-menu, console.close-confirmation, console.host-issue-rows, usage.quick-sheet, console.no-hosts-empty).
