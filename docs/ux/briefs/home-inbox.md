# Brief: Home + Status Inbox

Task: UX1-home. Read [../design-system.md](../design-system.md) first. RN today: `apps/mobile/src/home/*`,
`apps/mobile/src/app/index.tsx`.

## Swift screens

| Screen id | Atlas file | Notes |
|---|---|---|
| `shell.home` | none (iPhone only, no image); source `Console/Home/ConsoleHomeView.swift`, `Console/StatusInbox/StatusInboxView.swift` | the launcher |
| `shell.home-new-menu` | none | the "+" menu |
| `console.row-context-menu`, `console.quick-detail-sheet` | `ScreenAtlasTests/testInboxCardMenu/` (+ Papel) | long-press menu, Details sheet |
| `console.close-confirmation` | `testCloseConfirmation/` | swipe Close asks first |
| `console.host-issue-rows`, `console.host-connection-sheet` | `testHostProblems/` | offline/failing host lines |
| `console.no-hosts-empty` | iPhone atlas `ScreenAtlasTests/testNoHosts/console.no-hosts-empty.png` | the only iPhone image |
| `usage.quick-sheet` | none | ring opens it (see usage brief) |

## What makes it good

- **One scroll, three zones, no tab bar**: the inbox (what needs me now), a horizontal Sessions strip, Hosts. Everything
  else is one tap away through "See all" and the "+" menu.
- **Priority by color and position**, not by chrome: the Needs you card has a 1 pt blocked-color outline (40%); Working and
  Done are plain cards. Caps keep Home short: Working shows 3, Done shows 5, Needs you is uncapped.
- Footer line "N idle" (footnote secondary) left, "See all" (footnote semibold accent) right, inset 8.
- Sessions cards are **terminal thumbnails** (132 x 84, `terminalBackground`, program glyph top-left at 70%, prompt line in
  mono at the bottom) with the title and host under them; they scroll horizontally edge to edge (the list row has zero
  horizontal inset, the strip pads itself `screenInset`).
- Host cards are quiet: key icon in a 34 pt `control` circle, name (subheadline semibold), address (caption mono, middle
  truncation), state dot (8) and summary (caption2). The summary turns `warning` when the Host is offline.
- "+" is a 58 pt accent circle floating bottom trailing in its **own reserved strip** (the list ends above it), with an accent
  glow shadow. Menu order is fixed: New Agent, New Terminal, Add Host.
- Wide phones (width >= 600) lay Inbox cards and Host cards in **two columns** (`CardPairRow`); Sessions unchanged.
- Time-driven: age text refreshes every 60 s and at status transitions (`StatusInboxSchedule`).

## Layout notes (Swift pt -> Índigo x1.3)

Order top to bottom: offline-host lines (footnote, `warning`, `wifi.exclamationmark` label, tap opens the connection sheet) ->
inbox sections or skeleton or quiet card -> idle/See all footer -> **Sessions** header (count capsule + "See all") ->
sessions strip -> **Hosts** header -> host cards.

| Element | Swift | Índigo |
|---|---|---|
| Row inset | 4 top/bottom, 16 sides | 5 / 21 |
| Section gap (before Sessions, Hosts) | 20 | 26 |
| Header -> first card | 4 | 5 |
| Inbox card padding | 12 all sides, 8 between lines | 16 all sides, 10 between lines |
| Inbox card title | subheadline semibold, program mark 16, pin glyph caption2 tertiary | same; age on the right, caption monospacedDigit secondary |
| Inbox card detail | footnote secondary, up to 3 lines (6 at AX sizes) | same |
| Inbox chips | `MetaChip`s, 4 apart, `ViewThatFits` row else column | gap 5 |
| Skeleton | 72 high, radius 8, `surfaceOverlay`, two | same |
| Quiet state | card: "All quiet. Nothing needs you." subheadline secondary, padding 16 | padding 21 |
| Session tile | 132 x 84, padding 10, radius chip+2 | 132 x 84 (fixed), padding 13, radius 8 |
| Session label | 6 under tile; mark 14 + title caption semibold; host caption2 mono | gap 8 |
| Host card | padding 14, radius card, icon 34 | padding 18 |
| "+" | 58, trailing 16, bottom 8 | 58, trailing 21, bottom 10; accent glow 35%, blur 12 |
| Usage ring | 24, stroke 3, number 9 bold; colored accent/warning/danger by level | same; hit target 32 min |

Navigation: card tap pushes Agent detail; long-press = context menu (Pin, Details, Open in New Window iPad only, Close...) with the
lifted card preview; leading swipe Pin, trailing swipe Close (confirms); Host card tap opens Host detail, a failing host opens
the connection sheet; Host long-press menu: Host Details, Usage, Files, Ports (live, non-Windows hosts only), Retry Now (offline).
Gear opens Settings **as a sheet**; the ring opens the usage quick sheet; Hosts is reached from the Host cards and Settings
(the RN toolbar server icon and the overflow menu with Agents/Board/Usage are RN inventions: move Agents/Board into "See all"
and the board entry into the Agents presentation menu; keep Usage in the ring).

## Índigo adaptation

- Title "Agentico" is the product name in Swift; RN shows the product name (`OpenAgentsPocket`) as a large inline title,
  Índigo ink. Toolbar trailing: one glass capsule holding ring + gear (no server icon, no overflow).
- Screen background = canvas + glow. Needs-you outline uses `statusBlocked` at 40%.
- Ring colors: accent normal, `warning`, `danger` (thresholds in `UsageLimitLevel`; RN `meterColor`).
- Papel: same layout; cards get the hairline; the "+" glow is replaced by a 1 pt hairline-darker shadow (accent at 20%).

## Acceptance checklist (side-by-side judge)

- [ ] Large inline title and a single trailing glass capsule (ring, gear); no other toolbar buttons.
- [ ] Section order: offline lines, Needs you, Working, Done, idle/See all footer, Sessions, Hosts.
- [ ] Section headers sentence case, footnote semibold, count in a capsule, "See all" accent on the right.
- [ ] Needs you card has a colored 1 pt outline; others only the hairline; radius 8 everywhere.
- [ ] Card: program mark with status dot in its corner, title, age right-aligned, 3-line detail, chip row.
- [ ] Sessions are terminal-colored thumbnails in a horizontally scrolling strip that bleeds to both screen edges.
- [ ] "+" is a 58 pt accent circle, bottom trailing, in a reserved strip (last row never hides behind it); menu order New Agent, New Terminal, Add Host.
- [ ] Spacing: 26 before Sessions/Hosts, 5 between cards, 21 side inset (measure on the screenshot).
- [ ] Width >= 600: two columns of cards.
- [ ] Skeleton while loading; quiet card when empty; No Hosts empty state with Add Host and Setup Guide.
- [ ] Papel and AX-size (stacked header: title above age) variants hold.
