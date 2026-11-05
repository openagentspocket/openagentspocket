# UX1-console: the console screens the Swift atlas had and RN lacked
status: partial
branch: ux-console
changed: apps/mobile/src/features/agents/{AgentsScreen,AgentsToolbar,RenameSheet}.tsx, features/terminals/TerminalsListScreen.tsx (new), features/hosts/HostConnectionSheet.tsx (new), features/new-agent/{WorktreeDetailsScreen,useWorktreeDialogs (new)}.ts(x), app/agents.tsx, dev/atlas/{familyConsole,ConsoleDemos (new),entries,atlasMap.json}
tests: `pnpm verify-fast` green
atlas ids (dark + Papel): console.search, host-filter-menu, presentation-menu, rename-sheet, terminals-list, worktree-details, worktree-remove-confirm, host-connection-sheet, new-item-button, agent-row. new-terminal / workspace-picker / directory-browser already existed.
done:
- Search is a mode as in Swift: the field and a close circle replace the toolbar and title; close clears the query.
- Presentation menu items carry their glyphs (list, server, folder, status).
- Rename sheet: Cancel / Save in the bar, the "Leave empty to fall back to the detected kind (x)" hint.
- Worktree Details: sheet bar (Done, Worktree), grouped rows, Show Changes and Remove Worktree as card rows with the footnote; dialogs moved to `useWorktreeDialogs`.
- Terminals list: workspace headers that fold, TerminalGroup cards with New Terminal, ListToolbar.
- Host connection sheet: Staging-style sheet (state, routes, failure, Retry Now, Stop Connecting, Edit).
- console.new-item-button and console.agent-row are the plain Agents list (the Swift shots are that list).
left (TODO, no RN logic yet):
- Terminals list data: no RN store lists a Host's shell panes. `TerminalsListScreen` takes groups as a prop and the atlas feeds fixed ones; there is no route or entry point (Home/Agents switcher) yet. Presentation menu has one entry; the host filter is inert.
- Host connection sheet is not opened from anywhere: Home's offline issue row still pushes Host Detail. Needs a per-Host reconnect state (attempt number, failure per route) from `useHostChecks`.
- Worktree Show Changes uses the `branch` glyph (Swift plus/minus has no icon in `Icon.tsx`; lead may add one).
- Remove confirmation shows as the bottom dialog, not Swift's popover anchored to the button.
- Rename keeps a "Name" label (Swift field has none) and opens as a medium sheet, not Swift's compact floating one.
- Menus open at the left on web (no anchor measure); iOS measures. Host filter menu has no header in either.
