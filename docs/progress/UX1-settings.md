# UX1-settings: assemble Settings sheet and sub pages from the cloned components
status: partial
branch: worktree-wf_308cc08d-920-8
changed: apps/mobile/src/settings/** (SettingsScreen, SettingsHeader, SettingsRowView, ThemeCards, ToolbarPreview, AppLockCover, ChatCacheRows, ChatSample, AcknowledgementsList, schema and pages, useSettingsSummary), apps/mobile/src/app/settings/_layout.tsx, apps/mobile/src/app/_layout.tsx, apps/mobile/src/navigation/modalRoutes.test.ts, apps/mobile/src/dev/atlas/{entries.tsx,atlasMap.json}, apps/mobile/src/notifications/NotificationSettingsScreen.tsx, packages/ui (ListRow icon slot, valueLeading, valueTone; Section iconInset; PickerRow accent; Icon names), packages/i18n/src/extras
tests: pnpm verify-fast → green (related suites)
acceptance:
- Settings opens as a sheet with large title and Done capsule: met (own `settings` Stack group declared `presentation: 'modal'` once in the root stack; the root page draws the capsule and large title, pushed pages get the native inline header and back).
- Section titles/order, sentence case, empty sections omitted: met for the rows RN has.
- Rows with leading icon (22 in 28 slot), title, subtitle, value, chevron, hairlines inset past the icon: met.
- Theme page: Preview, Automatic, one ThemeChoiceCard per theme with palette dots and check circle: met (list, as the Swift shot shows, not a 2-column grid).
- Notifications value on the root row (On / Off / Failed): met. Hosts count on the Hosts row: met. Fonts & Size value: met.
- Toggle tint accent, pickers open a menu with accent value, destructive rows confirm: met.
- Toolbar page (Preview, Keys, Behavior, Reset), Chat page footer, Acknowledgements as name | license: met.
- App lock cover (`shell.app-lock`): met (AppLockView, atlas entry).
- Agent Rows editor with live preview: not met (no RN state/route for agent list fields yet).
- Snippets, Overlay Networks, Setup Guide, Privacy Policy rows: not met (features do not exist in RN).
- Papel and AX variants: Papel captured and reads right; AX not checked.
left:
- Agent Rows page (AgentListFieldsEditor + Preview exist in packages/ui; needs a core store, then `SETTINGS_ROUTES.agentRows`).
- Snippets manager/editor, Overlay Networks family, Setup Guide: need the features first.
- Chat text size shows the offset (-2), Swift shows absolute points.
- Theme page footer ("Noche is a dark theme...") not added.
- Verify the sheet presentation and header on the iOS simulator (web has no native modal).
notes:
- Atlas ids added: settings.theme, settings.appearance, settings.chat, settings.chat-cache, settings.input-toolbar, settings.license-notice, shell.app-lock (settings.acknowledgements now the schema page).
- On web the atlas forces the theme but not the setting, so the Theme page preview and selected card stay Índigo in Papel captures.
- Pressing a ListRow whose onPress returns a promise deadlocks RNTL's awaited fireEvent when it opens a confirm; rows start the dialog without returning its promise.
- Stale Metro on the same port serves old bundles: kill the listener before re-capturing.
- Evidence sheets: /private/tmp/claude-501/-Users-eaprules/96b69bbe-4c3e-4245-9ae5-f3863fee18ff/scratchpad/rn/evidence/UX1-settings/
