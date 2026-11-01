# 0005. Seven phases, in this order

Status: accepted (2026-11-01)

## Decision

1 Hosts, pairing, SSH transport. 2 Agents, Inbox, Chat, approvals, plus Focus mode, overview board and two-line summaries. 3 Terminal. 4 Usage, Files, Ports, Settings. 5 Notifications (APNs + FCM). 6 Live Activities, widgets, Watch, Siri (native Swift targets inside Expo). 7 ACP through the plugin, spiked with fx.

## Why

Transport first: everything else is useless without it. Native-extension work last because it is the most platform-specific.
