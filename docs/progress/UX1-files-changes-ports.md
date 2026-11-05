# UX1-files-changes-ports: assemble Files, Changes and Ports from the cloned components
status: partial
branch: worktree-wf_7d8339f1-ab3-4
changed: apps/mobile/src/{files,changes,ports} (FilesScreen, PathChip, FileRow, TransferBar, ChangesScreen, ChangesHeader, ChangedFileRow, FileDiffScreen, DiffContent, PortsScreen, PortRow, PortPreviewScreen, leaveDialog), apps/mobile/src/app/{files,changes/index,changes/diff,ports/index,ports/preview,_layout}.tsx, apps/mobile/src/dev/atlas/{familyFiles,atlasMap.json,AtlasActions,FilesPortsDemos,atlas.test}, packages/ui (ChangeRow: U kind, optional counts, expanded chevron, indent; Icon hash)
tests: pnpm verify-fast -> green (related suites; changes 13/13, files, ports 6/6, atlas)
acceptance:
- Changes top card (repo, Worktree capsule, branch counters, last commit, freshness, totals) via ChangeRow summary: met. Groups in order, one hairline card each with uppercase title and count: met. Per-row stats and status letter (M amber, A green, D red, ? tertiary, U danger): met.
- Untracked directories expand inline, Copy Path long-press menu, pull to refresh: met (Insert Path not built: RN has no insert target).
- Diff: back capsule, file title with folder subtitle, DiffRow (status line, `@@` hunk band with "N unchanged lines", numbered lines, word-level washes from a token head/tail diff of paired removed/added lines), unified or side by side, pinned "Read at" footer: met.
- Files: Done / title / up and "+" capsules, path chip, folders first, dimmed hidden names, secret badge, mono caption, swipe Rename/Delete taken from the row menu, pinned transfer bar with Cancel: met. Date captions: met (FakeSsh takes `modified` by path; the demo FS has mtimes; caption is dateStyle medium + timeStyle short).
- Ports: Done / title / # capsules, host chip, grouped PortRow with address chip, mono port, unreachable dimmed with the reason, Show All: met. Preview: slim bar with close and host:port, bottom toolbar kept, shared leave dialog: met.
- Papel captured and read for every id.
left:
- Insert Path menu entry. files.quick-look, share-sheet, save-to-files, upload-pickers are native system UI (the atlas shows the RN step before them).
- Small differences: date captions use the locale medium format ("Oct 21, 2026, 10:00 AM"), Swift prints "21 Oct 2026 at 13:00"; the web atlas has no status bar so headers sit higher than the Swift shots.
- browser.preview has no Swift shot and shows the WebView stub; verify on the iOS simulator.
notes:
- Rename now uses the shared centered alert with a text field (`prompt()` in packages/ui, AlertHost field); RenameSheet removed. Delete, download and collision alerts already used the centered dialog.
- FilesScreen uses Screen `bare` (the double padding made the chip-to-list gap 3x Swift). SheetBar gained `subtitle`.
- Routes files and ports are now modal sheets (own SheetBar, headerShown false); changes and diff keep the stack but draw a SheetBar with a back capsule.
- Atlas script gained thenPress (menu items after a long press). changes.file-diff opens the first modified demo file.
- Evidence: /private/tmp/claude-501/-Users-eaprules/96b69bbe-4c3e-4245-9ae5-f3863fee18ff/scratchpad/rn/evidence/UX1-files-changes-ports/
