# UX3-nav-sheets: Clone ListToolbar, SidebarColumn, EmptyDetail, QuickSheetHeader, ScannerFrame, KeyValueGroup
status: done
branch: worktree-wf_ec0a968a-c0f-7
changed: packages/ui/src/components/{ListToolbar,SidebarColumn,EmptyDetail,QuickSheetHeader,ScannerFrame,KeyValueGroup}.tsx, navSheets.ts, navSheets.test.tsx, gallery/components/navSheets.tsx, primitives/Icon.tsx (home, filter, list, sidebar, windows), gallery/Gallery.test.tsx (60 s timeout: the components section grows per group)
tests: pnpm verify-fast -> green (packages/ui related tests)
acceptance:
- each component per catalog: met (props cover default/detail/unavailable/scanning/denied variants); gallery entries in Indigo and Papel: met
- side-by-side sheets: met for structure (Swift crop | Indigo | Papel), see evidence dir below; Papel captured with --theme papel
- tests pin interactions (home/new/hide/search/close/paste/manual/settings, corner brackets, copy button only where asked): met; no screens touched: met
left: ListToolbar toolbar icons are smaller than Swift (Button icon size is fixed; a UX1 follow-up could add an icon size prop); SidebarColumn demo rows are plain ListRows (UX1-wide assembles real AgentCard rows); ScannerFrame live camera bracket frame has no Swift crop, built from the catalog text.
notes: labels are props with English defaults (the app passes t()); native SwiftUI menus carry no accessibilityLabel on iOS, tests assert by testID.
evidence: /private/tmp/claude-501/-Users-eaprules/96b69bbe-4c3e-4245-9ae5-f3863fee18ff/scratchpad/rn/evidence/UX3-nav-sheets/*.png
