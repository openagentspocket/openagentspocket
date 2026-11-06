# session-bridge

Answers the app's session protocol over tmux, so a Host without herdr looks like a relocated herdr (ADR 0027).

```bash
pnpm --filter @openagentspocket/session-bridge build
node packages/session-bridge/build/main.js install
```

`install` writes the launcher to `~/.config/openagentspocket/bin/herdr`, starts the bridge on
`~/.config/openagentspocket/herdr/herdr.sock` and prints both paths, the endpoint a Pairing Code would carry. A tmux
session is a workspace, a window a tab, a pane a pane. Agent, status and session come from the programs' own hooks
(`packages/plugin/src/program-hook.js`), which leave a record per pane in `panes/`; without one the status is `unknown`. `pair` runs the plugin's own pairing ceremony for it and shows the QR. `autostart` installs a user service (launchd or systemd) so it survives a restart; `install` does not do that on its own.
