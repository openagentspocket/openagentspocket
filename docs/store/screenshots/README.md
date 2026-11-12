# App Store screenshots

iPhone with Dynamic Island, medium display (1206x2622, portrait: the size App Store Connect asks for first, and the simulator's own), English, dark theme (`negro`), no frames or captions.

## How they were made

Each one is an atlas screen captured on the project simulator with demo data and a clean 9:41 status bar:

```
node scripts/atlas-ios.mjs --udid <simulator udid> --theme negro <atlas id>
```

The files are the captures as taken, not scaled.

| File | Atlas id |
|---|---|
| `en/01-home.png` | `shell.home` |
| `en/02-chat.png` | `agent-detail.chat` |
| `en/03-approval.png` | `agent-detail.chat-blocked-card` |
| `en/04-changes.png` | `changes.list` |
| `en/05-usage.png` | `usage.tab` |
| `en/06-agents.png` | `console.agents-list-by-status` |
