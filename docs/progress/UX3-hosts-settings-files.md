# UX3-hosts-settings-files: Clone HostRow, HostStatusCard, SettingsGroup, ThemeChoiceCard, FileRow, PortRow
status: done
branch: worktree-wf_ec0a968a-c0f-11
changed: packages/ui/src/components/{HostRow,HostStatusCard,SettingsGroup,ThemeChoiceCard,FileRow,PortRow}.tsx, hostsSettingsFiles.ts, hostsSettingsFiles.test.tsx; packages/ui/src/gallery/components/hostsSettingsFiles.tsx; packages/ui/src/primitives/ListRow.tsx (subtitleMono, subtitleLines, backward compatible)
tests: pnpm verify-fast -> green; jest hostsSettingsFiles.test.tsx 16/16
acceptance: met. Components in gallery (Indigo and Papel), compared against the crops with atlas-compare (evidence in scratchpad rn/evidence/UX3-hosts-settings-files). Tests pin tap, retry, reconnect, toggle, selected state, menu, unreachable port.
left: UX1 assembly tasks adopt the components; Icon set lacks a palette and "AA" glyph (SettingsGroup demo uses sparkles/keyboard); PortRow has no Swift crop (built from PortsView.swift: glyph, name, address chip + detail, mono port, chevron).
notes: FileRow follows the crop (proportional name, mono caption), not the checklist line "name mono". ThemeChoicePreview is exported next to ThemeChoiceCard for the `preview` variant. Rows are transparent; group them in Section.
