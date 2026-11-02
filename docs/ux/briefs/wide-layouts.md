# Brief: iPad and wide layouts (sidebar column)

Task: UX1-wide. Depends on every family (it composes them). RN today: no split layout; `metrics.readableWidth` 720 centers
single columns. Another worker (`wide-sidebar`, `wide-qa`) may be exploring this: check `git log` and `docs/progress/` before starting.
Read [../design-system.md](../design-system.md) first.

## Swift screens

| Screen id | Atlas (iPad, the only complete atlas) |
|---|---|
| `shell.ipad-sidebar` (sidebar + empty detail) | `ScreenAtlasTests/testAgentsLists/console.agents-list-by-status.png` |
| `console.empty-detail` | same image, right side ("No Agent Selected" + New Agent) |
| `shell.list-switcher` (Agents / Terminals / Usage popover, 220 pt) | no image; `Console/ConsoleSidebarChrome.swift` |
| `shell.wide-iphone-footer` | no image (landscape Max, unfolded Duo) |
| `usage.ipad-split`, `usage.wide-layout` | `testUsage/usage.tab.png` |
| `agent-detail.container` with sidebar | `testChat/`, `testAgentDetailTerminal/` (left column = session drawer variant of the list) |
| `shell.hosts-settings-sheets` as form sheets | `testSettingsAppearance/`, `testHostsListAndForms/` |

Sources: `Console/ConsoleSplitPresentation.swift`, `ConsoleView+SplitView.swift`, `ConsoleView+Sidebar.swift`, `ConsoleDetailColumn.swift`.

## What makes it good

- **Two columns, one list**: at regular width the Console is a split view: **sidebar** (list: Agents / Terminals / Usage) and **detail**.
  There is no Home on a regular-width window with a sidebar. The sidebar is a *rounded floating panel* (card radius, inset from the
  screen edges) holding the same cards the phone list uses, so every card, swipe and menu is reused unchanged.
- Sidebar chrome: header = title menu ("Agents v", opens the 220 pt switcher popover with a checkmark), "+" menu (New Agent / New
  Terminal), sidebar toggle; search field below; footer icons: Hosts, Settings (leading), list menu + presentation (trailing).
  Usage mode footer has only Hosts and Settings.
- Selection in the sidebar is a **2 pt accent ring** on the card (not a fill) and the card is not re-pushed; the detail swaps.
- Widths: sidebar min 320, ideal 380, max 600 (user-draggable; landscape default visible, portrait defaults to detail only and
  hides itself after a selection opens). Visibility is remembered per list tab.
- Empty detail: centered symbol, "No Agent Selected", one-line help, a primary "New Agent" button with its shortcut hint.
- Hosts and Settings are **centered form sheets** (about 540 x 620), not full-screen; Usage becomes a split with the Host column.
- Hardware keyboard: command palette (Cmd+N new agent, Cmd+K switch, Cmd+W close).
- Wide phones (width >= 600: landscape Max, unfolded Duo) keep Home but lay cards in two columns (Home brief) and add the sidebar-style
  footer menus on the list.

## Layout notes

Detail column keeps the content edge to edge; the sidebar floats 10 pt (8 x1.3) from the screen edge with radius 8 (Swift 20-ish).
Chat/reading content caps at `metrics.readableWidth` 720 and centers inside the detail column. Breakpoints to use: **width >= 600**
= two-column Home cards; **width >= 744 or `regular` size class** = sidebar split. Use `useWindowDimensions` plus a `useLayoutMode()`
hook in `packages/ui` returning `compact | wide-phone | split`; never branch on device model.

## Índigo adaptation

Sidebar panel = `surface` over canvas glow with the hairline; divider between panel and detail is the canvas gap, not a line.
Selected ring `accent`. Form sheets use `surfaceOverlay`, radius 16.

## Acceptance checklist

- [ ] At a regular width the app shows a floating sidebar panel + detail; no Home; empty detail with New Agent.
- [ ] Sidebar header title menu switches Agents / Terminals / Usage with a checkmark.
- [ ] Footer has Hosts and Settings icons (sheets) and list/presentation menus; Usage mode shows only Hosts and Settings.
- [ ] Selected card has a 2 pt accent ring; selecting swaps the detail without a push animation.
- [ ] Sidebar is 320 to 600 wide, remembered per tab; portrait hides it after a selection.
- [ ] Hosts/Settings/New Agent open as centered form sheets on wide screens.
- [ ] Rotation and resize (Split View) keep the selected Agent and the draft.
- [ ] Wide phone: two-column cards on Home; Papel and AX variants hold.
