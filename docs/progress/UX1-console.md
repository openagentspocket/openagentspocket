# UX1-console: the console screens the Swift atlas had and RN lacked
status: partial
branch: ux-console
changed: apps/mobile/src/features/agents/{AgentsScreen,AgentsToolbar,RenameSheet}.tsx, features/terminals/TerminalsListScreen.tsx (new), features/hosts/HostConnectionSheet.tsx (new), features/new-agent/{WorktreeDetailsScreen,useWorktreeDialogs (new)}.ts(x), app/agents.tsx, dev/atlas/{familyConsole,ConsoleDemos (new),entries,atlasMap.json}
tests: `pnpm verify-fast` green
atlas ids (dark + Papel): console.search, host-filter-menu, presentation-menu, rename-sheet, terminals-list, worktree-details, worktree-remove-confirm, host-connection-sheet, new-item-button, agent-row. new-terminal / workspace-picker / directory-browser already existed.
reusable pieces (packages/ui/src/components, exported via navSheets):
- `SearchBar`: SearchField plus a glass close circle, the bar that takes over a list while searching (new).
- `TextPromptSheet`: one-line text prompt sheet, Cancel/Save in the bar, hint under the field; `RenameSheet` is now a thin wrapper (new).
- `ConnectionSheet`: state, mono detail, failure, primary and text action, optional Edit; `HostConnectionSheet` is a thin wrapper (new).
- `FoldHeader` gained `subtitle` (headline title plus secondary word, folds): used by the Terminals list workspace headers.
- Presentation menu icons are items of the existing `ActionMenu`; no console-local copy of a menu, sheet or row remains.
done:
- Search is a mode as in Swift: the field and a close circle replace the toolbar and title; close clears the query.
- Presentation menu items carry their glyphs (list, server, folder, status).
- Rename sheet: Cancel / Save in the bar, the "Leave empty to fall back to the detected kind (x)" hint.
- Worktree Details: sheet bar (Done, Worktree), grouped rows, Show Changes and Remove Worktree as card rows with the footnote; dialogs moved to `useWorktreeDialogs`.
- Terminals list: workspace headers that fold, TerminalGroup cards with New Terminal, ListToolbar.
- Host connection sheet: Staging-style sheet (state, routes, failure, Retry Now, Stop Connecting, Edit).
- console.new-item-button and console.agent-row are the plain Agents list (the Swift shots are that list).
round 2 (review fixes):
- Show Changes uses `Icon` `diff`.
- Remove Worktree confirm is the anchored popover (`confirm({ presentation: 'popover', anchorKey })` + `useAnchor` on the Remove row), like Close Pane. `alert-dismiss` testID added to the popover backdrop (tests dismiss through it).
- Host connection sheet opens from the offline lines of Home and of the Agents list through one component, `features/hosts/HostIssues` (HostIssueRow + sheet). State is live from the Console store: attempt and failure from `HostSummary.status`, route from the new `HostSummary.routeId`, failure words through `presentation()` (`connections/failureText.ts`). Retry Now = `store.retry`, Stop Connecting = new `store.stopConnecting` (session.suspend), Edit opens the Host form. The summary row (3+ offline Hosts) still opens nothing.
- Terminals list is fed by herdr: `session.snapshot` already carries every pane, so `projectSnapshot` now returns `terminals` (panes with no Agent), `HostConsoleProjection.terminals`, `ConsoleStore.terminals(hostId?)`, hook `useConsoleTerminals`, and core `groupTerminals` / `terminalTitle` (tested). Route `/terminals?host=` (`app/terminals.tsx`), Host menu entry "Terminals" (all platforms), `hrefs.terminals` / `hrefs.shell`. The demo Console has shell panes. Resync retry timer moved to `console/resync-retry.ts` (projection.ts length ratchet).
left:
- Opening an existing shell pane from the list: the `/terminal` route only creates new shells (`tab.create`); there is no attach-to-pane route for a non-Agent pane, so rows have a chevron but no action. "+ New Terminal" in a group opens a new shell in that workspace's directory.
- Terminals list: presentation menu has one entry; the host filter is inert; no swipe Close / long-press menu on rows yet (`pane.close` exists on the wire).
- Host connection sheet: the route line shows the first saved route when none is live; no per-route failure list beyond `presentation()` detail.
- Rename keeps a "Name" label and opens as a medium sheet (Swift: compact, no label). Menus open at the left on web (no anchor measure); iOS measures.
