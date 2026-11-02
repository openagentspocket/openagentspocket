# Brief: Notifications, banners, alerts and toasts

Task: UX1-notifications. RN today: `apps/mobile/src/notifications/InAppBanner.tsx`, `packages/ui/src/primitives/Banner.tsx`,
`overlay/{ToastHost,AlertHost,confirm}`. Read [../design-system.md](../design-system.md) first.

## Swift screens

| Screen id | Atlas / source |
|---|---|
| `shell.notification-banner` | no image; `Notifications/AgentNotificationBannerView.swift`, `AgentNotificationBannerStore.swift` |
| `agent-detail.chat-banners` | `ScreenAtlasTests/testChatBanners/` |
| `settings.notifications`, `.notification-explainer`, `.notification-privacy` | `testSettingsNotifications/`, `testSettingsNotificationExplainer/` |
| `agent-detail.alerts` / failure alerts | iPhone atlas `testCloseFailureAlert/agent-detail.alerts.png` (dark + Papel) |
| `console.close-confirmation` | `testCloseConfirmation/` |
| `agent-detail.terminal-status-overlay` | `testTerminalStatusOverlay/` |
| widgets / Live Activities | out of scope (native extensions) |

## What makes it good

- **In-app banner**: a small material card pinned to the top of the *whole* console (above pushed screens), max 520 wide, centered
  on wide screens; title one line (`agentico . claude`), body two lines or, for Blocked, the captured **question in mono, three
  lines** that fills in if it arrives while the banner is up. Tap opens the Agent. It leaves when the Agent's status moves on.
  Enter: slide from top + fade (`.snappy`); leave: reverse. No stacking: a newer banner replaces the older.
- **Chat banners** sit under the header inside the chat: "Connecting to the Host...", "Not connected. Showing saved messages.",
  "Couldn't read the conversation. <why>": footnote text on a tinted wash row with leading glyph, trailing `Retry` / `Show Agent
  Terminal` text buttons; calm colors (info or warning wash), never danger unless data is lost.
- **Alerts** are system alerts: a short title, one-sentence message, destructive action labelled with its scope, Cancel. Failures
  say what happened and what was not done ("nothing was sent").
- **Settings explainer**: notification privacy is told in plain language before the OS prompt (a pushed page with a primary
  "Turn On" button), then the row value shows On/Off/Failed.
- **Terminal status overlay**: centered translucent card on the terminal (state glyph, one line, Retry/Reconnect).

## Layout notes

Banner: padding 14x10 -> 18x13, radius 14 -> 8, material (`surfaceRaised` 90% + hairline, blur where available), gap 2 -> 3 between
lines, top inset = safe area + 10, horizontal margin 16 -> 21. Chat banner: padding 10x13, radius 8 (or full-bleed band 0 radius),
footnote text. Toast (RN-only, keep): bottom, `surfaceRaised`, radius 8, 2.4 s default (`TOAST_DEFAULT_MS`), never covering the
composer (offset by the composer height).

## Índigo adaptation

Washes from tokens at 15%: info (connecting), warning (not connected), danger (failed read). Question block in mono on
`terminalBackground` at 60% inside the banner. Papel uses solid `surfaceRaised` with a hairline shadow.

## Acceptance checklist

- [ ] Banner pinned top over every screen, max 520 wide, tap navigates to the Agent, auto-leaves on status change.
- [ ] Blocked banner shows the question (mono, up to 3 lines); fills in live.
- [ ] Enter/leave motion: slide + fade, 250 to 350 ms, off with reduce motion.
- [ ] Chat banners: three states with Retry and Show Agent Terminal; wash colors from tokens.
- [ ] Alerts and confirmations name the scope and are destructive-styled; failure alerts say nothing was changed.
- [ ] Notification privacy explainer precedes the OS prompt; settings row shows state.
- [ ] Toast never overlaps the composer; Papel and AX variants hold.
