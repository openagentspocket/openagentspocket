# UX1-settings-pages: Terminal Palette, Agent List Fields and the missing settings atlas ids
status: partial
branch: ux-settings
changed: packages/ui/{tokens/terminal-themes/*.json,scripts/gen-terminal-themes.mjs,src/theme/terminalPalettes.ts,src/components/OptionListSheet.tsx}, apps/mobile/src/settings/{TerminalPaletteScreen.tsx,agentFields/*,schema,pages*,customRows,ChatCacheRows}, apps/mobile/src/app/settings/{_layout,agent-fields/*}, apps/mobile/src/dev/atlas/{familySettings,entries,atlasMap.json}, packages/core/src/settings/preferences.ts (terminalTheme), scripts/gen-terminal-palettes.py
tests: pnpm verify-fast -> green
acceptance:
- Terminal Palette page (settings.terminal-theme-picker): live preview, footnote, 30 curated palettes with swatches, check on the selected one; two slots as in Swift (`terminalThemeLight` default Flexoki, `terminalThemeDark` default Vesper), the picker edits the slot of the appearance on screen; reached from a "Terminal Palette" row on the Theme page: met (palettes are data: one JSON per theme in packages/ui/tokens/terminal-themes, imported once from Swift by scripts/gen-terminal-palettes.py).
- Agent List Fields: Host list, per-Host editor with live preview, Add field sheet, Sync confirm, reset-saved-fields confirm with the unreadable banner, field menu (secondary style, move, remove); layouts persist per Host in the device key-value store (`AgentFieldsStore`, unreadable data is kept and flagged until reset): met.
- Every terminal follows the palette: `TerminalThemeProvider` (root layout, from the two slots) and `useTerminalColors` feed GhosttyTerminal (background, foreground, 16 ANSI colors) and PlainTerminal: met in code and unit tests, not seen on a device (iOS libghostty applies the theme app-wide).
- Destructive confirms that Swift anchors (sync, reset, clear chat cache) use the popover presentation with `anchorKey`: met.
- Atlas ids captured dark and Papel: settings.terminal-theme-picker, settings.agent-list-fields(-host, -add-field, -sync-confirm, -reset-confirm), settings.chat-cache-clear-confirm, settings.usage (alias of usage.tab), shell.hosts-settings-sheets (alias of settings.root), settings.theme. settings.notification-explainer already existed (familyNotifications).
left:
- Sync from plugin resets the Host to the default rows. A real sync needs a plugin method that returns herdr's sidebar fields per Host (the Swift `HerdrSidebarSnapshotStore` snapshot: ordered rows of field ids plus diagnostics, with a minimum plugin version), then `AgentFieldsStore.setRows(host, snapshot rows)`. The RN plugin/transport has no such method yet.
- The field menu is an action sheet (style, move left/right, remove); Swift anchors a Menu to the chip.
- The Console's Agent rows do not read the saved layout yet (the store and the preview do).
- settings.theme--catppuccin-mocha, --gruvbox-dark, --nord, --papel: RN ships three app themes by decision (brief); they are not built. Papel itself is the --theme papel capture of settings.theme.
- Snippets row stays hidden (no route).
reusable:
- `TerminalThemeProvider` + `useTerminalColors` (packages/ui/src/terminal): the one source of terminal colors; any new terminal surface calls the hook.
- `AgentFieldsStore` (packages/core/src/settings/agent-fields.ts): per-Host layouts over KeyValueStorage with unreadable handling, move, style; hook `useAgentFields` in the app.
- `anchorKey` on Button and ListRow (register a popover anchor), `syncAnchorKey` on AgentListFieldsEditor, `dimmed` on its rows; `alert-dismiss` testID on the popover backdrop.
- Terminal theme registry: adding a theme = one JSON in packages/ui/tokens/terminal-themes + `pnpm gen` (gen-terminal-themes.mjs validates it, `gen:check` pins it); `terminalPalette`, `terminalThemeOptions`, `terminalThemeById` in packages/ui serve any terminal surface. `terminalTheme` accepts any id (unknown renders the default), so core never lists themes.
- OptionListSheet (packages/ui): grouped pick-list sheet with Cancel, reusable for fields, peers, keys.
- Settings schema: new pages `terminalTheme` and `agentFields` (custom blocks `terminalPalette`, `agentFieldHosts`); Agent Rows root row is a schema `page` row. Only the per-Host editor is a route (it needs the Host param).
- confirmClearChatCache and confirmResetSavedFields are exported so the atlas opens the same dialogs the screens use.
notes:
