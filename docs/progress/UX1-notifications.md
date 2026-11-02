# UX1-notifications: assemble banners, alerts and toasts from cloned components
status: partial
branch: worktree branch of wf_308cc08d-920-18
changed: apps/mobile/src/notifications/ChatBanners.tsx, apps/mobile/src/agent-detail/AgentDetailScreen.tsx, apps/mobile/src/dev/atlas/{entries.tsx,atlasMap.json}, packages/ui/src/components/NoticeBanner.tsx (radius from tokens, tighter), packages/ui/src/primitives/Icon.tsx (wifi)
tests: pnpm verify-fast -> green (ui + mobile related suites)
acceptance:
- Chat banners (connecting / not connected / read failure / launch) with Retry and Show Agent Terminal, tone washes from tokens: met (ChatBanners from core bannerLines, rendered under the header; atlas agent-detail.chat-banners). Engine not wired: lines come from a `chatStatus` prop until the conversation engine exists.
- Locating wait via NoticeBanner kind=locating: met.
- In-app banner pinned top / blocked question mono / motion: not met (still the shared toast host); NoticeBanner `inapp` exists but InAppBanner does not use it yet.
- Alerts, close-confirmation, terminal status overlay atlas entries: not done.
left: switch InAppBanner to NoticeBanner inapp with question block (3 mono lines) and slide+fade; atlas ids shell.notification-banner, console.close-confirmation, agent-detail.terminal-status-overlay, settings.notification-explainer; wire real host status into chatStatus; Papel sheet (atlas-compare --theme light had no Swift Papel shot for this id).
notes: banner moved above the Agent switcher to match Swift order. Evidence sheet: scratchpad/rn/evidence/UX1-notifications/agent-detail.chat-banners.png
