# Brief: Settings

Task: UX1-settings. RN today: `apps/mobile/src/settings/*` (schema-driven: `pages*.ts`, `SettingsScreen.tsx`, `SettingsRowView.tsx`,
`ThemeCards.tsx`), `apps/mobile/src/notifications/*`. Read [../design-system.md](../design-system.md) first.

## Swift screens

| Screen id | Atlas (`ScreenAtlasTests`, plus Papel) |
|---|---|
| `settings.root` (also `settings.theme`, `.appearance`, `.terminal-theme-picker`, `shell.hosts-settings-sheets`) | `testSettingsAppearance/` |
| `settings.notifications`, `.notification-privacy`, `.notification-explainer` | `testSettingsNotifications/`, `testSettingsNotificationExplainer/` |
| `settings.chat`, `.chat-cache`, `.chat-cache-clear-confirm` | `testSettingsChat/`, `testChatCacheClearConfirm/` |
| `settings.agent-list-fields`, `.agent-list-fields-host`, `.agent-list-fields-reset-confirm` | `testSettingsAgentListFields/`, `testAgentFieldsResetConfirm/` |
| `settings.input-toolbar`, snippets (`agent-detail.snippets-manager`, `.snippet-editor`) | `testSettingsInput/` |
| `settings.overlay-networks` and the overlay family (form, detail, diagnostics, confirms) | `testSettingsOverlayNetworks/`, `...TailscaleDetail/`, `...ZeroTier/`, `...EasyTier/` |
| `settings.usage` | `testSettingsUsage/` |
| `settings.acknowledgements`, `.license-notice`, `hosts.setup-guide` | `testSettingsHelp/` |
| `shell.app-lock` | `testAppLock/` |

## What makes it good

- **A sheet with a large title "Settings" and a leading Done capsule**, inset-grouped sections with *sentence-case* headers:
  Appearance (Theme with five palette dots + name, Fonts & Size with value), Agents (Notifications with On/Off/Failed value, Chat
  "Finished turns, cache", Agent Rows "Fields, order, preview"), Input (Toolbar, Snippets with count), Hosts and Network (Hosts
  count, Overlay Networks count), Security (device-gated), General (Usage), Help (Setup Guide, Acknowledgements, Star on GitHub,
  Privacy Policy). Empty groups vanish.
- Every row has a **leading line icon** (secondary ink), a title, an optional one-line subtitle, a trailing value, and a chevron
  when it pushes. Pages push inside the sheet with inline titles and the system back button.
- **Theme page**: preview cards (mini screen mock in each palette) in a 2-column grid, selected one has a 2 pt accent ring and a
  check; Índigo default, Papel, Noche, plus Swift's extras are *not* required (RN ships three). Dark/Light pairing follows the system.
- Footers explain consequences in footnote secondary ("what this does"); destructive rows (Clear cache) confirm with a dialog.
- Security: Require Face ID to Open, Lock timeout picker (Immediately / 1 / 5 / 15 min) appearing only when on, Face ID for SSH
  keys; footer states the 10 s key reuse and that notifications are unaffected. App lock cover is a full-screen canvas with the
  logo and an Unlock button.
- Agent Rows editor: live preview card at the top of the page that updates as fields are added, reordered (drag handles) or removed.

## Layout notes

Row min height 56, icon 22 in a 28 slot, gap 13, title body, subtitle footnote secondary (max 2 lines), value callout secondary,
chevron 12. Section: header footnote semibold secondary above (inset 10 from the card edge), card radius 8 with hairlines inset 21 +
icon slot width, footer 10 below, 31 between sections, screen inset 21, large title top gap. Toggle rows: iOS `Switch` tinted
`accent`, subtitle under the title. Pickers: row with value + chevron up/down opening a native menu (not a modal list).
Pages that are lists of cards (overlay networks) use card rows with swipe Remove.

## Índigo adaptation

Palette dots are the theme's accent plus status colors. Theme preview cards render from tokens of each theme (mini canvas, surface
card, accent bar), not images. Switch track on = `accent`. Section header ink `textSecondary`; footer `textTertiary`.

## Acceptance checklist

- [ ] Settings opens as a sheet from Home's gear: large title, Done capsule leading.
- [ ] Section titles and order match; sentence-case headers; empty sections omitted; Security only with a device passcode.
- [ ] Each row: leading icon, title, optional subtitle, value, chevron; 56 high; hairline separators inset past the icon.
- [ ] Theme page: preview cards in two columns, selected ring and check, changes live without reload.
- [ ] Notifications page shows state value on the root row (On / Off / Failed).
- [ ] Toggle tint is accent; picker rows open a native menu; destructive rows confirm.
- [ ] Agent Rows page has a live preview above the field editor.
- [ ] App lock cover matches `shell.app-lock`.
- [ ] Papel and AX variants hold.
