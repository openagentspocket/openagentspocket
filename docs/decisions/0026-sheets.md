# 0026. Sheets: one look, one sizing rule, two hosts

Status: accepted (2026-11-05)

## Research (Expo docs, Expo blog on liquid glass sheets, react-native-screens 4.30 types)

- Route sheets: `presentation: 'formSheet'` with `sheetAllowedDetents` (fractions ascending, or `'fitToContents'`),
  `sheetCornerRadius`, `sheetGrabberVisible`, `sheetExpandsWhenScrolledToEdge` (iOS). Android: at most 3 detents,
  no native headers or nested stacks inside the sheet. `flex: 1` content works with numeric detents but not with
  `fitToContents`.
- The iOS 26 Liquid Glass look is the system's, and shows only when the screen's content background is transparent.
  Other routes to glass (expo-ui BottomSheet, TrueSheet) are beta or add a dependency and a native rebuild.

## Decision

- The look is the app's themed sheet (the JS `Sheet`, approved by the owner): opaque themed surface, radius from
  `metrics.sheetRadius`, grabber, edge to edge. Route sheets use the native form sheet with the same radius and the
  same opaque surface; we do not make them transparent, so Índigo and Papel read the same in both hosts and
  Liquid Glass is not mixed in sheet by sheet.
- Two hosts, one rule. In-screen sheets (a state on a screen) use `Sheet`; routes use `sheetOptions` (root stack only).
- Sizing rule: content short -> the height of its content; content long, scrolling or pushing screens -> full.
  - `Sheet` defaults to `fit` (content height between `sheetMinShare` and `sheetMaxShare`, scrolling past that), so
    long content is already as tall as the cap. `medium` is no longer used; `large` stays only for content that is
    a flex list and cannot size itself.
  - `sheetOptions(theme, { size })`: `full` (default) = detent `[1]`. Routes never open at a guessed fraction
    (Settings, Hosts, Theme and Easy Pair opened at 70% before). `fit` = `fitToContents` for a route whose content has
    its own height.
- A choice that leaves a sheet for a route runs after the sheet has left (`Sheet onDismissed`, iOS cannot present
  while dismissing). The Home + button is a `ChoiceSheet` through `Fab`, no longer a small menu.
- `add-host` stays a transparent route that draws the same `ChoiceSheet`: one look, no native sheet to size.

## Audit (every sheet)

Native form sheet routes (`sheetOptions`, full): hosts, ports, files, settings, new-agent, new-terminal, worktree.
Transparent route: add-host (ChoiceSheet).
JS `Sheet`, fit: Usage quick sheet, Quick detail, Open Port, Add Host choice, New (+) choice, Connection, Text prompt,
Paste review (app and ui), Notifications disclosure, Attach links, Snippets pickers.
JS `Sheet`, large (flex content): Browse Directories, Skill content (app and ui), Option list, Overlay peer picker,
Select text, Background Work, Accounts, Plugin notice, What happens, Snippet editor, Subagent transcript.
JS `Sheet`, fraction: Usage day sheet (0.65).
Migrated in this change: Connection, Text prompt, Paste review (medium -> fit); the + menu (ActionMenu -> ChoiceSheet);
all route sheets (70% and full -> full).
