# session-bridge

Answers the app's session protocol over tmux, so a Host without herdr looks like a relocated herdr (ADR 0027).

```bash
pnpm --filter @openagentspocket/session-bridge build
node packages/session-bridge/build/main.js install
```

`install` writes the launcher to `~/.config/openagentspocket/bin/herdr`, starts the bridge on
`~/.config/openagentspocket/herdr/herdr.sock` and prints both paths, the endpoint a Pairing Code would carry. A tmux
session is a workspace, a window a tab, a pane a pane. Agent status is `unknown`: notifications come from the programs'
own hooks (`packages/plugin/src/program-hook.js`). The bridge does not start at login yet.
