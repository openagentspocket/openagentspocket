# UX1-tint-audit: platform controls take their tint from the theme, through one wrapper each
status: done
branch: tint-audit
changed: packages/ui/src/primitives/{Toggle,Spinner,ThemedRefreshControl,ThemedTextInput}.tsx (new) + tint.test.tsx, Text/ProgramMark/Button/Screen/VirtualList/FormRows/SettingsGroup and 20 more UI files moved onto the wrappers, packages/ui/src/motion.ts (`usePulse`), apps/mobile/src/{agent-detail/terminal/StatusOverlay,notifications/*Section}.tsx, scripts/check-theme-literals.mjs
tests: `pnpm verify-fast` green; tint.test.tsx pins the switch, spinner and text input colors to the tokens in Índigo and Papel
wrappers (all in packages/ui, exported from the index):
- `Toggle` (Switch): accent track on, control fill off, Android thumb from tokens; used by ToggleRow and SettingsGroup.
- `Spinner` (ActivityIndicator): `color` is a token key (secondary by default, accent for the main wait); used by Button, SheetBar, NoticeBanner, chat rows, panes and the app's status sections.
- `ThemedRefreshControl` (RefreshControl): accent spinner and raised background, other props forwarded; used by Screen and VirtualList.
- `ThemedTextInput` (TextInput): caret (`cursorColor`), selection, Android selection handles and the keyboard appearance from the theme, placeholder in tertiary ink; used by TextField, SearchField, Composer, ComposerCard, SidebarColumn, SessionDrawer, OverlayPeerPicker, AlertHost and PlainTerminal.
- `Text` also sets the accent as `selectionColor` for selectable text.
- Native menus (`@expo/ui` SwiftUI) already take `seedColor` from the accent; there is no native picker in the app (PickerRow is our own menu).
lint: `scripts/check-theme-literals.mjs` (part of verify-fast) now also fails on a value import of `Switch`, `RefreshControl`, `ActivityIndicator` or `TextInput` from `react-native` anywhere in apps/mobile/src or packages/ui/src except the four wrapper files (types such as `TextInputProps` stay allowed).
ProgramMark vs Swift (`AgentProgramMark.swift`): badge ratio 0.5, gap 1.5, offset badge/4, cut-out center at size minus badge/4 and rounded badge diameter all match the RN geometry (`badgeGeometry`). The Working pulse was missing: Swift pulses the Agent chip's dot (opacity 1 to 0.25, 0.75 s autoreverse, off with Reduce Motion, `TerminalAgentSwitcher.swift`). `ProgramMark` now takes `pulse` (via `usePulse`) and the AgentSwitcher chips pass it. Other places keep the still dot, as in Swift (the status pill shows the orb).
note: the first usage.tab capture came out blank on web because `ThemedRefreshControl` dropped the children and style a web ScrollView clones into its control; it now forwards every prop. Re-captured, matches main.
left:
- Android thumb colors and the selection handles are token-driven but only the iOS-style jest host was exercised; no device check.
- SidebarColumn's search placeholder moved from secondary to tertiary ink (the shared input's rule).
