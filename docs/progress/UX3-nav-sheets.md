# UX3-nav-sheets: Clone ListToolbar, SidebarColumn, EmptyDetail, QuickSheetHeader, ScannerFrame, KeyValueGroup
status: done
branch: worktree-wf_ec0a968a-c0f-7
changed: packages/ui/src/components/{ListToolbar,SidebarColumn,EmptyDetail,QuickSheetHeader,ScannerFrame,KeyValueGroup}.tsx, navSheets.ts, navSheets.test.tsx, gallery/components/navSheets.tsx, primitives/Icon.tsx (home, filter, list, sidebar, windows), gallery/Gallery.test.tsx (60 s timeout: the components section grows per group)
tests: pnpm verify-fast -> green (packages/ui related tests)
acceptance:
- each component per catalog: met (props cover default/detail/unavailable/scanning/denied variants); gallery entries in Indigo and Papel: met
- side-by-side sheets: met for structure (Swift crop | Indigo | Papel), see evidence dir below; Papel captured with --theme papel
- tests pin interactions (home/new/hide/search/close/paste/manual/settings, corner brackets, copy button only where asked): met; no screens touched: met
left: SidebarColumn demo rows are ListRows with ProgramMark and a selected fill, not full AgentCards (UX1-wide assembles those); ScannerFrame live camera bracket frame has no Swift crop. The EmptyDetail stacked-windows glyph is the SF Symbol rectangle.on.rectangle on iOS (same as Swift); the web capture shows Material's flip_to_front fallback, so only the iOS pass shows the true glyph. The native iOS ActionMenu Menu draws its own symbol size (iconSize applies to the JS menu and plain buttons).
review fixes (round 2): KeyValueGroup Indigo was a bad capture, not a render bug: another worktree's Expo server held port 8123 (the first capture hit it / a cold bundle). scripts/ux-components.mjs now polls for the capture element instead of a fixed 8 s wait; use a unique --port. Re-captured and reviewed Indigo and Papel for all five components; compare run with and without --theme light. SidebarColumn: headline title, 36 pt search at 15 pt, tighter header, 18 pt footer glyphs, ListRow `selected` fill, ProgramMark rows. ListToolbar: Button/ActionMenuButton `iconSize` prop, 26 pt glyphs. QuickSheetHeader.detail: ProgramMark (Codex logo, working status dot) and ' · ' separator; per-program logos exist in the repo (ProgramMark/ProgramLogo). EmptyDetail: shortcut hint is a ReactNode, demo uses the command glyph hint.
notes: labels are props with English defaults (the app passes t()); native SwiftUI menus carry no accessibilityLabel on iOS, tests assert by testID.
evidence: /private/tmp/claude-501/-Users-eaprules/96b69bbe-4c3e-4245-9ae5-f3863fee18ff/scratchpad/rn/evidence/UX3-nav-sheets/*.png
