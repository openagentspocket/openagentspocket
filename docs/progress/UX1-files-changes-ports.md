# UX1-files-changes-ports: assemble Files, Changes and Ports from the cloned components
status: partial
branch: worktree-wf_7d8339f1-ab3-4
changed: apps/mobile/src/{files,changes,ports} (FilesScreen, PathChip, FileRow, TransferBar, ChangesScreen, ChangesHeader, ChangedFileRow, FileDiffScreen, DiffContent, PortsScreen, PortRow, PortPreviewScreen, leaveDialog), apps/mobile/src/app/{files,changes/index,changes/diff,ports/index,ports/preview,_layout}.tsx, apps/mobile/src/dev/atlas/{entries,atlasMap.json,AtlasActions,FilesPortsDemos,atlas.test}, packages/ui (ChangeRow: U kind, optional counts, expanded chevron, indent; Icon hash)
tests: pnpm verify-fast -> green (related suites; changes 13/13, files, ports 6/6, atlas)
acceptance:
- Changes top card (repo, Worktree capsule, branch counters, last commit, freshness, totals) via ChangeRow summary: met. Groups in order, one hairline card each with uppercase title and count: met. Per-row stats and status letter (M amber, A green, D red, ? tertiary, U danger): met.
- Untracked directories expand inline, Copy Path long-press menu, pull to refresh: met (Insert Path not built: RN has no insert target).
- Diff: back capsule, file title, status line with letter and counts, unified or side by side with line numbers: partly (still DiffView; DiffRow hunk band and word-level washes not wired, the core patch has no word segments).
- Files: Done / title / up and "+" capsules, path chip, folders first, dimmed hidden names, secret badge, mono caption, swipe Rename/Delete taken from the row menu, pinned transfer bar with Cancel: met. Date caption missing in the demo (fake FS has no mtime).
- Ports: Done / title / # capsules, host chip, grouped PortRow with address chip, mono port, unreachable dimmed with the reason, Show All: met. Preview: slim bar with close and host:port, bottom toolbar kept, shared leave dialog: met.
- Papel captured and read for every id.
left:
- DiffRow adoption (hunk bands, word-level washes, "N unchanged lines" gap) needs a core mapping from patch hunks to DiffRowLine segments.
- Insert Path menu entry. files.quick-look, share-sheet, save-to-files, upload-pickers are native system UI (the atlas shows the RN step before them).
- browser.preview on web shows the WebView stub; verify on the iOS simulator.
- The gap between the path chip and the first group is larger than Swift; check on iOS.
notes:
- Routes files and ports are now modal sheets (own SheetBar, headerShown false); changes and diff keep the stack but draw a SheetBar with a back capsule.
- Atlas script gained thenPress (menu items after a long press). changes.file-diff opens the first modified demo file.
- Evidence: /private/tmp/claude-501/-Users-eaprules/96b69bbe-4c3e-4245-9ae5-f3863fee18ff/scratchpad/rn/evidence/UX1-files-changes-ports/
