# Brief: New Agent (and New Terminal)

Task: UX1-new-agent. RN today: `apps/mobile/src/features/new-agent/*`, `apps/mobile/src/app/new-agent.tsx`, `packages/ui/src/form`.
Read [../design-system.md](../design-system.md) first.

## Swift screens

| Screen id | Atlas |
|---|---|
| `console.start-agent` | `ScreenAtlasTests/testHomeAndNewMenu/` (+ Papel) |
| `console.workspace-picker` | `testHomeAndNewMenu/` |
| `console.directory-browser`, `console.new-terminal` | `testNewTerminal/` (new terminal); directory browser: no image |
| `console.new-item-button`, `shell.home-new-menu` | `testAgentsLists/`, none |

Swift sources: `Console/StartAgentView*.swift` area (`console.start-agent`), `Console/ConsoleView+Navigation.swift`.

## What makes it good

- A **form sheet**: inline title "New Agent", `Cancel` leading, `Start` trailing (disabled until valid, spinner while launching;
  dismissal is blocked while launching). On iPad it is a centered form sheet ~540 wide.
- Sections in order, each with a footer that teaches: **Host** (picker row, "Select a Host" accent value) -> **Workspace** (row
  "Workspace" value "None reported" or the name; opens the workspace picker with *Recent* directories, Browse Directory..., New
  Workspace) -> **Worktree** (toggle "Start in a new worktree", footer "Run the agent in a clean checkout instead of the workspace
  itself.") -> **Agent** (chooser of installed agents detected on the Host's PATH, Detect Again/Retry) -> **Agent Name** (optional,
  footer "Empty names the agent after its kind.") -> **Tab Name** (optional) -> **Arguments** (optional, mono, footer with quoting
  rules and an example `--model "gpt 5" --continue`).
- Everything stays live: picking a Host triggers agent discovery and recent directories in the background without blocking.
- Directory browser: path chip, folder list, `Choose` action; New Workspace field for typing a path.
- New Terminal: smaller form (Host, Workspace, optional Tab Name), same chrome.

## Layout notes

Fields are single-line rows inside grouped cards (radius 8, min height 56) with placeholder in `textTertiary`; footers footnote
secondary inset 10; section gap 31. Picker rows show value + up/down chevron and open a native menu. Keyboard: `scroll to focused`,
"next" moves between fields, "go" on Arguments starts. Sheet detent: large (form), no grabber needed but swipe-to-dismiss disabled
while launching.

## Índigo adaptation

Start is a text button in `accent` (disabled `textTertiary`); the Agent chooser rows use `ProgramMark` + name, selected row has a
checkmark in `accent`. Toggle tint `accent`. Errors (Host unreachable, no agents found) are inline `wash(danger)` rows in the section.

## Acceptance checklist

- [ ] Form sheet with Cancel and Start in the bar; Start disabled until Host and Agent chosen; spinner during launch; dismiss blocked.
- [ ] Section order and footers as above; optional fields clearly optional.
- [ ] Workspace picker lists Recent (max 10) when present, Browse Directory..., New Workspace.
- [ ] Agent chooser shows installed agents with marks, Detect Again on failure.
- [ ] Opens from Home "+", the Agents list "+", and the session drawer; after Start, navigates to the new Agent's detail.
- [ ] New Terminal variant matches; Papel and AX variants hold.
