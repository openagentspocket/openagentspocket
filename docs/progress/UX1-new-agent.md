# UX1-new-agent: New Agent and New Terminal form sheets in the Swift structure
status: done
branch: worktree-wf_7d8339f1-ab3-5
changed: apps/mobile/src/features/new-agent/{NewAgentScreen,LaunchSections,AgentSections,DirectoryBrowserSheet,NewTerminalScreen (new),WorkspaceFields (new),newAgent.test}.tsx, apps/mobile/src/app/{new-terminal (new),new-agent via _layout,index,terminal,_layout}.tsx, features/terminals/ShellTerminalScreen.tsx (label), dev/atlas/{entries,NewAgentDemos (new),atlasMap.json}, packages/ui/src/{components/SheetBar,overlay/Sheet,form/FormRows,primitives/ListRow}.tsx
tests: `pnpm verify-fast` green; jest src/dev/atlas + src/home 25/25
acceptance:
- Form sheet with Cancel and Start in a SheetBar; Start disabled until valid, spinner while launching, Cancel disabled while launching: met (SheetBar `loading`).
- Section order Host, Workspace, Worktree, Agent, Agent Name, Tab Name, Arguments, each with its teaching footer and grouped single-line rows: met (atlas sheets).
- Workspace picker menu lists Workspaces, Recent (max 10, with path), Browse Directory..., New Workspace: met (`console.workspace-picker`); the old Recent section is gone, a Recent pick still fills the New Workspace draft (test updated).
- Agent chooser rows with ProgramMark, check in accent, Detect Again: met. Host row always shown (was hidden with one Host).
- Directory browser: grabber, centered title, Select trailing, pill filter field, path card (name, mono path, up arrow), Folders group: met.
- New Terminal form (Host, Workspace, Tab, Cancel/Open) at `/new-terminal`, Home + menu opens it, Open replaces it with the shell (`label` param added): met.
- Opens from Home +, Agents list +, session drawer; after Start navigates to the Agent: unchanged route behavior, tests pass. Papel and AX not checked on a device.
left:
- iPad centered form sheet ~540 wide not wired (modal presentation unchanged): tracked as task UX1-new-agent-ipad-sheet in docs/tasks.yml, together with the Agents list / sidebar-footer entries.
- Maestro flow e2e/new-terminal.yaml written but not run (integrator runs flows on the shared simulator).
review fixes:
- Host-less atlas state: AtlasData `newAgent: 'hostless'` (two Hosts, none picked) feeds console.start-agent, workspace-picker and new-terminal: "Select a Host", "None reported", placeholder Agent row, Start/Open disabled. The Workspace row is no longer disabled without a Host (Swift opens its menu there).
- Sheet's trailing action now uses the SheetBar glass capsule (BarAction exported from SheetBar): directory browser Select is a capsule.
- Workspace picker anchor was a real bug, not web-only: PickerRow's menu had no anchor and always opened at the bottom. It now measures its row and opens beside it (checked in the atlas).
- Entry points: the phone only has Home + (New Agent / New Terminal, plus Host menu New Agent and the Agent menu new tab). The Agents list + and the session drawer in Swift are the wide/iPad sidebar footers (shell.wide-iphone-footer): moved to UX1-new-agent-ipad-sheet. RN has no session drawer yet. Papel workspace-picker and new-terminal sheets were captured and look fine.
notes:
- `PickerRow` options take `section`, `subtitle`, `icon` and `valueTone`; `ListRow` takes `titleTone`.
- `Section` only separates direct children, so the Agent rows are an array, not a fragment.
