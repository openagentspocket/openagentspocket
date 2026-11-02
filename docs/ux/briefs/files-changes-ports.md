# Brief: Files + Changes + Ports

Task: UX1-files-changes-ports. RN today: `apps/mobile/src/files/*`, `changes/*`, `ports/*`, `packages/ui/src/diff`. Read
[../design-system.md](../design-system.md) first.

## Swift screens

| Screen id | Atlas |
|---|---|
| `changes.list`, `changes.file-diff` | `ScreenAtlasTests/testChanges/` (+ Papel) |
| `files.browser`, `files.quick-look`, `.download-confirm`, `.upload-pickers`, `.upload-collision`, `.rename-alert`, `.delete-confirm`, `.share-sheet`, `.save-to-files` | no image; `Files/FileBrowserView.swift`, `FileBrowserDialogs.swift` |
| `browser.ports`, `browser.open-port`, `browser.preview`, `browser.leave-confirm` | no image; `Browser/PortsView.swift`, `PortPreviewView.swift` |
| `console.worktree-details`, `console.worktree-removed` | `testWorktreeDetails/`; iPhone atlas `testWorktreeRemoved` |

## What makes it good

- **Changes** is a calm summary then a list: a top card (repo name headline + `Worktree` capsule, branch glyph + name bold with
  behind/ahead counts, the Agent's task line, `Possibly incomplete . Read at 23:49` footnote, totals `+2 -2` top-right), then a
  group header "CHANGES" with count, then file rows: file name (body), directory caption secondary, `+1 -1` mono green/red, status
  letter (M amber, A green, D red, ? gray) at the far right. Groups in order: Conflicts, Staged, Changes, Untracked; untracked
  directories expand inline. Row long-press: Copy Path, Insert Path (closes Changes and inserts into the draft; only when an
  insert target exists). Pull to refresh re-reads git status. Title "Changes" inline with a circular back button.
- **File diff** = unified or side-by-side (wide) with word-level highlights, line numbers in mono tertiary, hunk headers in a
  `control` band, added/removed lines on a 15% green/red wash with a 3 pt rail. Sticky file title with path.
- **Files**: a path chip on top (`~/...`), "enclosing folder" up chevron, rows folders first (folder glyph, name, trailing chevron)
  then files (doc glyph, name body, size + date caption mono); dot-files and git-ignored names dimmed; lock glyph on secret-
  looking names; "+" menu Upload Photo / Upload File; transfer bar pinned at the bottom (name, progress, Cancel); trailing swipe
  Rename / Delete (not full swipe); long-press menu Quick Look, Share, Save to Files, Copy Path, Rename, Delete. Big files and
  secret names ask first.
- **Ports**: Host chip on top; rows = container or process name, address badge ("Localhost", "All interfaces"), image/pid caption,
  port number in mono large on the right; unsafe-bound ports dimmed and disabled with "Not reachable through SSH safely"; "Show All
  (N more)" toggle hides system ports (< 1024, sshd, herdr); `#`-glyph in the bar opens Open Port.
- **Preview**: full-screen web view with a slim top bar (host:port, reload, share, close); leaving asks to stop the tunnel.

## Layout notes

Files and Ports are presented as sheets from Home's Host card menu (title Files/Ports, Done leading). Rows are **grouped rows in one
card** (`Section grouped`), min height 56, icon 22. Changes top card is a `Card` padded 21 with 10 gaps; the file list is a grouped
card with hairlines. Totals use `success`/`danger`, status letters use `warning` (M), `success` (A), `danger` (D), `textTertiary` (?).
Transfer bar: `surfaceRaised` card pinned above the safe area, 8 radius, progress `Meter` 4 pt.

## Índigo adaptation

Diff washes from `wash(success)`/`wash(danger)`; rails full-opacity. Path chip = `MetaChip` large. Papel diff uses the darker
status inks automatically.

## Acceptance checklist

- [ ] Changes: top card with Worktree capsule, branch counts, task line, freshness; groups in order; per-row stats and status letter.
- [ ] Untracked directory rows expand inline; Copy Path / Insert Path menu; pull to refresh.
- [ ] Diff view: unified on phone, side-by-side when wide, line numbers, word highlights, hunk bands.
- [ ] Files: path chip, up-folder control, folders first, dimmed hidden names, lock glyph, size/date mono, "+" menu, swipe Rename/Delete.
- [ ] Transfers show a pinned bar with progress and Cancel; no partial files remain after Cancel.
- [ ] Ports rows show badge + mono port; unsafe rows dimmed with the reason; Show All toggle; first-load and error empty states.
- [ ] Preview: slim bar and leave-confirm; tunnel stopped on close.
- [ ] Sheets presented from the Host card menu with Done; Papel and AX variants hold.
