# UX3-settings-pickers: Clone settings picker components
status: done
branch: worktree-wf_ec0a968a-c0f-13
changed: packages/ui/src/components/{TerminalThemePicker,TerminalThemePreview,AgentListFieldsEditor,AgentListFieldsPreview,OverlayPeerPicker,OverlayPeerViews,PortPreview}.tsx, settingsPickers.ts (barrel), settingsPickers.test.tsx, packages/ui/src/gallery/components/settingsPickers.tsx
tests: pnpm verify-fast → green (packages/ui related suites, 12 suites / 122 tests)
acceptance:
- components implemented per catalog, shown in /__gallery?section=components (Indigo and Papel): met; sheets Swift | Indigo | Papel compared for the six components with a crop (evidence in scratchpad rn/evidence/UX3-settings-pickers)
- PortPreview has no crop: judged against PortPreviewView.swift (title, progress, opening/paused/error states, bottom bar Back/Forward/Reload/Share): met, captured in the gallery but no compare sheet
- tests pin interactions (select palette, chips/add/sync/reset, peer pick/disabled offline/mode/search/failure retry, port bar enabled states, progress): met; no screen files touched
left:
- AgentListFieldsPreview draws the sample row from primitives because AgentCard (UX3-agent-rows) does not exist yet; swap it for the real AgentCard when that lands
- OverlayPeerPicker gallery shows the sheet body (`OverlayPeerPickerBody`); the `OverlayPeerPicker` wrapper adds the Sheet with Cancel and the network title
- Editor row spacing is a touch looser than the Swift crop; tune in UX1-settings assembly
notes:
- packages/ui does not depend on i18n: every string is a `labels` prop with English defaults (same pattern as DiffView/QR); screens pass t().
- Terminal palette colors are props (a palette's own colors, not app tokens); demos derive them from tokens so no color literals.
