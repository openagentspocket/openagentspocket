# Brief: Hosts + pairing

Task: UX1-hosts. RN today: `apps/mobile/src/app/hosts/*`, `apps/mobile/src/features/hosts/*`, `packages/ui/src/scanner`, `form`.
Read [../design-system.md](../design-system.md) first.

## Swift screens

| Screen id | Atlas |
|---|---|
| `hosts.list` | `ScreenAtlasTests/testHostsListAndForms/` (shown as the "Hosts" sheet), `shell.hosts-settings-sheets` in `testSettingsAppearance/` |
| `hosts.form`, `hosts.new-route` | `testHostsListAndForms/` |
| `hosts.peer-picker` | `testHostRouteOverlayPeerPicker/` |
| `hosts.remove-confirm` | `testHostRemoveConfirm/` |
| `hosts.plugin-notice` | `testPluginNotice/` (dark only) |
| `hosts.setup-guide` | `testSettingsHelp/` |
| `hosts.pairing-scanner`, `hosts.pairing-ceremony`, `hosts.detail`, `hosts.trust-alert`, `hosts.replace-key-alert` | no image; sources `Pairing/PairingScanView.swift`, `Hosts/HostListView.swift`, `Hosts/Preflight.swift` |
| `console.host-connection-sheet`, `console.host-issue-rows` | `testHostProblems/` |

## What makes it good

- Hosts is a **sheet over the app** (large title "Hosts", leading `Done` capsule, trailing glass capsule with *scan* (qr viewfinder)
  and `+`), never a tab. Everything about connecting starts from two glyphs.
- **Groups by state** in this order: Can't Connect, Trying, Connected, Not Connected; group headers fold (chevron, count
  capsule, remembered). Failures rise to the top so the problem is the first thing seen.
- A host row: server glyph with a tiny state dot, name (subheadline semibold) with `user@address` mono caption, latency
  ("<1 ms") trailing in secondary, chevron. A failing row shows a retry button. Swipe trailing Remove (full swipe, asks first);
  long-press Edit / Duplicate / Remove Host.
- After Add/Scan/Duplicate saves, the sheet pushes the new Host's detail so the user sees preflight run immediately.
- **Host detail** = status card first (state word, dot, Reconnect / Stop Connecting), then grouped sections: Changed host key
  (warning), Routes (In Use / Failed), Host, Preflight (five checks, each with a state glyph), Usage, Available Sessions, Overlay
  sign-in. Preflight rows turn from spinner to check/failure live.
- Pairing scan: full-bleed camera with a centered square viewfinder, hint "Point the camera at the Pairing Code shown by herdr.",
  bottom actions Paste Pairing Code and Add Manually; denied/unsupported states are full-page empty states with Open Settings.
- Trust prompts are alerts that show the fingerprint in mono, "Trust"/"Cancel".

## Layout notes

Sheet = design-system 5.7(a). List is `Section grouped` per state with header above; row min height 56 (x1.3), icon 22, state
dot 8 on the icon's lower trailing corner. Setup guide row at the bottom ("Setup Guide", footnote link). Empty: fill empty state
"No Hosts / Add a machine that runs herdr to get started." with Add Host + Scan to Pair actions. Unavailable catalog: fill empty
state with warning symbol, no actions. Form: inset grouped sections (Host, Credentials/Key, Routes, Options), text fields right-
aligned values, footers footnote secondary, trailing Save in the bar (disabled until valid), Cancel leading.

## Índigo adaptation

State dot colors: success, warning (reconnecting/trying), danger (can't connect), statusIdle (not connected). Host detail status card
is a `Card` with the dot (10) + headline; banner-style warning rows use `wash(warning)`. Camera viewfinder corners in `accent`,
2 pt, radius 8; dimmed area uses `backdrop`.

## Acceptance checklist

- [ ] Hosts is a sheet with large title, leading Done, trailing capsule holding scan and add.
- [ ] Groups appear in the Swift order, only non-empty ones, with fold chevrons and count capsules.
- [ ] Row: glyph+dot, name, mono user@address, latency, chevron; failing rows show retry; swipe Remove asks to confirm.
- [ ] Saving a new Host pushes its detail with preflight rows updating live.
- [ ] Detail section order matches (status card, key change, routes, host, preflight, usage, sessions, overlay).
- [ ] Scanner: viewfinder, hint copy through `t()`, Paste and Add Manually, denied and unavailable states.
- [ ] Form uses grouped rows, footers, Cancel/Save in the bar; keyboard never covers the focused field.
- [ ] Empty and Unavailable states per spec; Papel and AX variants hold.
