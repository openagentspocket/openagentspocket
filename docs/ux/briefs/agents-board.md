# Brief: Agents list + Board

Task: UX1-agents-list. RN today: `apps/mobile/src/features/agents/*`, `apps/mobile/src/board/*`, routes `agents.tsx`, `board.tsx`.
Read [../design-system.md](../design-system.md) first.

## Swift screens

| Screen id | Atlas (iPad, dark and Papel) |
|---|---|
| `console.agents-list-by-status` | `testAgentsLists/` (shows the sidebar column; best picture of the phone list) |
| `console.agents-list-by-workspace`, `-by-host`, `-flat` | `testAgentsLists/` |
| `console.agent-row` | `testAgentsLists/` |
| `console.search`, `console.presentation-menu`, `console.host-filter-menu`, `console.new-item-button` | `testAgentsLists/` |
| `console.row-context-menu`, `console.quick-detail-sheet` | `testInboxCardMenu/` |
| `console.close-confirmation` | `testCloseConfirmation/` |
| `console.rename-sheet` | `testAgentLifecycleSheets/` |
| `console.worktree-details`, `console.worktree-remove-confirm` | `testWorktreeDetails/` |
| `console.terminals-list` | `testTerminalsList/` |
| `console.empty-states-agents`, `console.no-hosts-empty` | none (iPhone: `testNoHosts` only) |

Swift sources: `Console/ConsoleView+AgentList.swift`, `ConsoleView+AgentRows.swift`, `AgentCardView.swift`,
`AgentRowLayout*.swift`, `ConsoleSectionHeaders.swift`, `ConsoleView+QuickDetail.swift`, `TerminalListView.swift`.
RN has no Swift Board: the board (`P2.13`) is an RN addition; keep it, give it the same card.

## What makes it good

- **Four presentations of the same cards**: By Status (Needs you / Working / Done / Idle), By Workspace (repo cards with linked
  worktrees nested under the repository card, count capsule + chevron to fold), By Host (host headers with state dot, collapsible),
  Flat. Switched from a menu in the list's bar (presentation menu with checkmark), plus a host filter menu (only when more than
  one Host). Choice persists.
- **A row is a card with up to three lines**, configurable per Host (Agent List Fields): line 1 program mark + title (headline)
  + [context-low badge] + status pill (wash, Working shows the orb), line 2.. caption secondary tokens, last line host name left
  and diff totals right (`+12 -7`, green/red, mono). A Blocked agent shows its question as a mono caption in the blocked color
  with a bubble glyph, 2 lines.
- **Gestures carry the workflow**: swipe right = Pin (warning tint, applies after 1 s), swipe left = Close (danger, asks first),
  long-press = menu with a lifted preview (Pin/Unpin, Details, Open in New Window iPad, Close <scope>), tap = push. Pinned float
  to the top of their section with a tertiary pin glyph.
- **Search** is the system search field in the list ("Search Agents"), filters live; no-match uses the system no-results view.
- Workspace cards: repository name (headline), `Host . /path` caption, count capsule, nested worktree rows indented; tapping the
  card header folds with `.snappy`.
- Terminals list is the same card language with a terminal glyph and cwd mono; trailing full swipe Close.

## Layout notes

Row card: padding vertical 4 (-> 5) inside the card, card inset 5/21 like Home, internal line gap 6 (-> 8), extra bottom padding up
to `min(rowGap,3) * 8` (-> x1.3) for configured blank lines. Title row `HStack` centered (not baseline: the pill is smaller), spacer
min 8 (-> 10), pill never truncates, title does. Status: no dot in row 1 (the pill carries it, the mark carries the dot).
Section header = design-system 5.3 with status color dot omitted (Swift uses plain headers; RN's `status` dot on `SectionHeader`
is optional, drop it for parity).
Toolbar (phone, pushed from "See all"): leading Home, title menu "Agents v" opens the list switcher (Agents / Terminals / Usage on
wide), trailing presentation + host filter + "+" (new Agent/Terminal), search field below the large-ish title.
Close confirmation: title names the widest scope ("Close Tab"), destructive button, Cancel.

## Índigo adaptation

Cards radius 8, hairline, canvas glow. Status pill inks use `theme.status`, wash 15%. Diff totals use `success` / `danger`. Pin tint
`warning`; Close tint `danger`. Quick detail sheet: medium detent, grabber visible, rows grouped in an overlay card (Workspace,
Directory, Host, Session, Pane id with copy buttons, mono values), primary buttons Open Chat and Open Terminal side by side, accent
and `control`.

Board (RN-only): columns by status, same `CardRow` content in a compact mode (title + pill + host); drag handle and fold persist as
today; do not invent a new card.

## Acceptance checklist

- [ ] Four presentations selectable from one menu with a checkmark; host filter hidden with a single Host.
- [ ] Row card shows mark+title, status pill at the end, caption lines, host left and totals right; Blocked shows its question line.
- [ ] Swipe right Pin (warning), swipe left Close (danger, confirms with the scope noun); long-press menu with lifted card preview.
- [ ] Pinned rows lead their section and carry a pin glyph.
- [ ] Section headers sentence case with count capsule; workspace/host headers fold with a rotating chevron (animated, reduce-motion off).
- [ ] Search field filters live; empty results and "No Agents" states match the fill/compact empty state spec.
- [ ] Context-low badge appears at <= 20% context left, before the pill.
- [ ] Quick detail sheet: medium detent, header kind + status + age, title, chips, detail rows with copy, Open Chat / Open Terminal.
- [ ] Spacing identical to Home cards (5 between, 21 inset); radius 8 hairline cards; Papel variant holds.
- [ ] AX text sizes: status dot becomes a glyph; pill still whole; title truncates.
