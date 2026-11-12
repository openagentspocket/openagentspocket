# App Store screenshots

6.9-inch iPhone (1320x2868, portrait), English, dark theme (`negro`), no frames or captions.

## How they were made

Each one is an atlas screen captured on the project simulator with demo data and a clean 9:41 status bar:

```
node scripts/atlas-ios.mjs --udid <simulator udid> --theme negro <atlas id>
```

The capture is 1206x2622 and was scaled to 1320x2868 (same aspect ratio) with `sips -z 2868 1320`.

| File | Atlas id |
|---|---|
| `en/01-home.png` | `shell.home` |
| `en/02-chat.png` | `agent-detail.chat` |
| `en/03-approval.png` | `agent-detail.chat-blocked-card` |
| `en/04-changes.png` | `changes.list` |
| `en/05-usage.png` | `usage.tab` |
| `en/06-agents.png` | `console.agents-list-by-status` |
