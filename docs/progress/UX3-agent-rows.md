# UX3-agent-rows: Clone AgentCard, FoldHeader, WorkspaceCard, TerminalRow, AgentRowMenu, HostIssueRow
status: done
branch: worktree-wf_ec0a968a-c0f-2
changed: packages/ui/src/components/{AgentCard,AgentCardBody,FoldHeader,WorkspaceCard,TerminalRow,AgentRowMenu,HostIssueRow,agentRowLabels,agentRows,agentRows.test}.ts(x), packages/ui/src/gallery/components/agentRows.tsx, packages/ui/src/primitives/Icon.tsx (wifiSlash)
tests: pnpm verify-fast → green; packages/ui agentRows.test.tsx → 13/13
acceptance:
- each component per catalog, Índigo and Papel on the side-by-side: met (sheets in scratchpad rn/evidence/UX3-agent-rows, Swift | Índigo | Papel)
- tests pin interactions (press, swipe/menu accessibility actions, long-press lifted menu, fold, pills, See all, issue summary): met
- no screen files touched: met
left: UX1 assembly tasks adopt the components; native glass menu surface (iOS 26) for AgentRowMenu; fold animation (chevron turns, no spring on rows yet); status glyph for the Working orb is the breathing orb, not the program-specific icon
notes:
- Strings: components take an `AgentRowLabels` prop (English defaults, as scanner/diff labels); screens pass t() values.
- AgentCard presentations: `row` (flat, hairline), `card` (workspace/board), `plain` (inside WorkspaceCard).
- `agentRowActions()` builds the Pin / Details / Close Pane menu and the swipe actions (leading Pin, trailing Close, full swipe).
- AgentRowMenu has an `inline` prop for the gallery/tests (Modal otherwise).
- Added Icon `wifiSlash` for HostIssueRow.
- Gotcha: `scripts/ux-components.mjs --theme both` leaves the papel captures at a wrong viewport (1280 wide); run indigo and papel as separate invocations.
