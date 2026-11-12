# App Store screenshots

iPhone with Dynamic Island, medium display (1206x2622, portrait: the size App Store Connect asks for first, and the simulator's own), English, dark theme (`negro`), no frames or captions.

## How they were made

Each one is an atlas screen captured on the project simulator with demo data and a clean 9:41 status bar:

```
node scripts/atlas-ios.mjs --udid <simulator udid> --theme negro <atlas id>
```

The files are the captures as taken, not scaled, saved as JPEG: App Store Connect does not process a screenshot with an alpha channel, and the simulator PNG has one.

| File | Atlas id |
|---|---|
| `en/01-home.jpg` | `shell.home` |
| `en/02-chat.jpg` | `agent-detail.chat` |
| `en/03-approval.jpg` | `agent-detail.chat-blocked-card` |
| `en/04-changes.jpg` | `changes.list` |
| `en/05-usage.jpg` | `usage.tab` |
| `en/06-agents.jpg` | `console.agents-list-by-status` |
