# UX1-settings-pages: Terminal Palette, Agent List Fields and the missing settings atlas ids
status: partial
branch: ux-settings
changed: apps/mobile/src/settings/{terminalPalettes.ts,terminalPalettes.json,terminalPalettesDetails.ts,TerminalPaletteScreen.tsx,agentFields/*,schema,pages*,customRows}, apps/mobile/src/app/settings/{_layout,agent-fields/*}, apps/mobile/src/dev/atlas/{familySettings,entries,atlasMap.json}, packages/core/src/settings/preferences.ts (terminalTheme), scripts/gen-terminal-palettes.py
tests: pnpm verify-fast -> green
acceptance:
- Terminal Palette page (settings.terminal-theme-picker): live preview, footnote, 30 curated palettes with swatches, check on the selected one; persisted as the `terminalTheme` setting; reached from a "Terminal Palette" row on the Theme page: met (palette data ported from the Swift GhosttyTheme catalog as JSON by scripts/gen-terminal-palettes.py; no hex in source).
- Agent List Fields: Host list, per-Host editor with live preview, Add field sheet (herdr and app fields), Sync confirm, reset-saved-fields confirm with the unreadable banner; root "Agent Rows" row now opens it: UI met.
- Atlas ids captured dark and Papel: settings.terminal-theme-picker, settings.agent-list-fields(-host, -add-field, -sync-confirm, -reset-confirm), settings.chat-cache-clear-confirm, settings.usage (alias of usage.tab), shell.hosts-settings-sheets (alias of settings.root), settings.theme. settings.notification-explainer already existed (familyNotifications).
left:
- The Terminal Palette is stored but no terminal renders with it yet (the Attach terminal does not read `terminalTheme`); Swift also keeps two slots (light and dark), RN keeps one choice that resolves per appearance.
- Agent List Fields layout is in memory per session: no persisted catalog, no plugin snapshot sync (Sync from plugin resets to the defaults), no style/move per field (tapping a field only offers Remove), no unreadable-saved-data detection (the atlas forces it).
- settings.theme--catppuccin-mocha, --gruvbox-dark, --nord, --papel: RN ships three themes by decision (brief), so these Swift-only variants are not built. Papel itself is the --theme papel capture of settings.theme.
- Snippets row stays hidden (no route).
notes:
- Web atlas dialogs use the bottom action sheet presentation where Swift shows an anchored popover.
