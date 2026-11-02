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
- Atlas shows the demo Host auto-selected (Swift shows "Select a Host" with a disabled Start): add an atlas data flag for a Host-less state.
- Sheet trailing Select/Start is a filled primary capsule in `Sheet`; Swift uses a glass capsule (SheetBar style): migrate the directory browser to SheetBar once Sheet accepts it.
- iPad centered form sheet ~540 wide not wired (modal presentation unchanged).
notes:
- `PickerRow` options take `section`, `subtitle`, `icon` and `valueTone`; `ListRow` takes `titleTone`.
- `Section` only separates direct children, so the Agent rows are an array, not a fragment.
