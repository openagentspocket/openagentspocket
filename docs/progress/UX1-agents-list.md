# UX1-agents-list: assemble the Agents list, Board and quick detail from the cloned components
status: partial
branch: worktree-wf_308cc08d-920-4
changed: apps/mobile/src/features/agents/{AgentsScreen,AgentGroup,AgentRow,AgentsToolbar,QuickDetailSheet,agentCardModel,agentRowLabels}.ts(x), apps/mobile/src/app/agents.tsx, apps/mobile/src/dev/atlas/{AtlasFrame,entries}.tsx, atlasMap.json, packages/ui (SearchField, ListToolbar hides an empty Host filter, AgentCard pinned glyph), packages/i18n extras (Open Chat)
tests: pnpm verify-fast -> all green (agents, board and atlas suites pass, testIDs and accessibility actions unchanged)
acceptance:
- Four presentations from one menu with a checkmark, Host filter hidden with a single Host: met (ListToolbar + presentation menu; atlas by-status, by-workspace, by-host, flat).
- Row card (mark, title, status pill, blocked prompt, subtitle, Host, path): met with AgentCard. Diff totals and the context-low pill are not met: the Console row carries neither.
- Swipe Pin / Close with confirmation, long-press lifted menu: met (agentRowActions + AgentCard); rename kept in the menu.
- Pinned rows lead and carry a pin glyph: met.
- Section headers with count capsule, fold chevron: met (FoldHeader status/host, WorkspaceCard; a workspace with one Agent is a plain card as in Swift).
- Search filters live, empty states: met (SearchField; EmptyState fill/compact).
- Quick detail sheet (kind, status, age, title, chips, copyable ids, Open Chat / Open Terminal, Pin, Close pinned in the footer): met, opened from the Details menu item.
- Board: not changed (kept as is, same ListRow card); see left.
left:
- Terminals list (console.terminals-list): RN has no shell-pane inventory in the Console store, so TerminalRow/TerminalGroup have no screen yet. Needs a core inventory first.
- Worktrees nested under the repository card, worktree details and remove confirmation (console.worktree-*): RepositoryCheckout is on the row but no grouping by repository exists in core.
- Diff totals (+12 -7) and context-left per Agent need Host data in ConsoleRow.
- Board still uses ListRow; move it to AgentCard presentation card in a compact mode.
- Atlas ids rename-sheet, close-confirmation, row-context-menu, search have no entry (sheets over the list need a way to open them).
notes:
- Swift has no stack header on this screen: the route hides it and draws ListToolbar (Home circle, capsule), a large title and the new SearchField.
- ListToolbar's Host filter is omitted when its item list is empty.
- Atlas: `AtlasData.presentation` seeds the list grouping; `AgentsScreen openDetail=<paneId>` opens the quick detail.
- The demo Console has one Host and four single-Agent workspaces, so the by-Host and by-workspace sheets show less structure than Swift's.
- Evidence: scratchpad rn/evidence/UX1-agents-list (dark) and /papel.
