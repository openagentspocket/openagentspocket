# UX1-agents-list: assemble the Agents list, Board and quick detail from the cloned components
status: partial
branch: worktree-wf_308cc08d-920-4
changed: apps/mobile/src/features/agents/{AgentsScreen,AgentGroup,AgentRow,AgentsToolbar,QuickDetailSheet,agentCardModel,agentRowLabels}.ts(x), apps/mobile/src/app/agents.tsx, apps/mobile/src/dev/atlas/{AtlasFrame,entries}.tsx, atlasMap.json, packages/ui (SearchField, ListToolbar hides an empty Host filter, AgentCard pinned glyph), packages/i18n extras (Open Chat)
tests: pnpm verify-fast -> all green (agents, board and atlas suites pass, testIDs and accessibility actions unchanged)
acceptance:
- Four presentations from one menu with a checkmark, Host filter hidden with a single Host: met (ListToolbar + presentation menu; atlas by-status, by-workspace, by-host, flat).
- Row card (mark, title, status pill, blocked prompt, subtitle, Host, path, diff totals, context-low pill): met. ConsoleRow has `changeTotals`/`contextUsage`, the store decorates rows (`setRowExtras`), demo data seeds them; a side with zero lines is left out as in Swift; nested workspace rows carry the totals under the title. Live feeds (Changes read, transcript usage) are still to wire.
- Flat rows name the Agent after the workspace (`iOS App · Codex`) when two visible Agents share the workspace label. Search drawer starts tucked on iPhone like Swift (pull down to reveal).
- Third round: compare sheets regenerated (dark and light, iPhone references); chevron checked vertically centred on every row.
- Swipe Pin / Close with confirmation, long-press lifted menu: met (agentRowActions + AgentCard); rename kept in the menu.
- Pinned rows lead and carry a pin glyph: met.
- Section headers with count capsule, fold chevron: met (FoldHeader status/host, WorkspaceCard; a workspace with one Agent is a plain card as in Swift).
- Search filters live, empty states: met (SearchField; EmptyState fill/compact).
- Quick detail sheet (kind, status, age, title, chips, copyable ids, Open Chat / Open Terminal, Pin, Close pinned in the footer): met, opened from the Details menu item.
- Review fixes: rows align with the title and dividers run edge to edge (AgentCard row padding removed, hairline bleeds through the screen inset, FoldHeader no side padding); toolbar always shows the filter (All Hosts + Hosts); rich demo (2 Hosts, workspaces with 2 Agents, session id) drives by-workspace and by-host; quick detail: no stray close, dense single-line footer buttons, 44 pt detail rows, detent 0.64 so Session and Pane id show.
- Board: not changed (kept as is, same ListRow card); see left.
left:
- Terminals list (console.terminals-list): RN has no shell-pane inventory in the Console store, so TerminalRow/TerminalGroup have no screen yet. Needs a core inventory first.
- Worktrees nested under the repository card, worktree details and remove confirmation (console.worktree-*): RepositoryCheckout is on the row but no grouping by repository exists in core.
- Live sources for diff totals and context usage (rn-gap section 10).
- The quick detail atlas entry draws over the by-status Agents list, not Home: Swift's reference is Home (a status inbox) and RN Home has no quick detail. Documented in atlasMap.json.
- Board still uses ListRow; move it to AgentCard presentation card in a compact mode.
- Also tracked in rn-gap.md section 10: SearchField gallery entry, quick detail age seed. Atlas ids rename-sheet, close-confirmation, row-context-menu, search have no entry (sheets over the list need a way to open them).
notes:
- Judge fixes round 2: quick detail is a floating inset sheet (`Sheet floating`: 8 pt side gutter, all corners rounded, bottom margin, detent fit so Pin / Close show), `KeyValueGroup compact` rows (36 pt, subheadline); by-workspace single-Agent card shows the book glyph (`AgentCardModel.glyph`), WorkspaceCard count pill smaller (24 pt, footnote, 10 pt chevron) and its body no longer indented.
- Swift has no stack header on this screen: the route hides it and draws ListToolbar (Home circle, capsule), a large title and the new SearchField.
- ListToolbar's Host filter is omitted when its item list is empty.
- Atlas: `AtlasData.presentation` seeds the list grouping; `AgentsScreen openDetail=<paneId>` opens the quick detail.
- The demo Console has one Host and four single-Agent workspaces, so the by-Host and by-workspace sheets show less structure than Swift's.
- Evidence: scratchpad rn/evidence/UX1-agents-list (dark) and /papel.
