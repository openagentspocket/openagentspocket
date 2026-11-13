# Agent coverage

What each Agent can do in the app, and how far that is proved. Update a cell when its proof changes.

- **device**: seen working on a real phone.
- **lab**: real program, on a test Host.
- **tests**: unit tests or synthetic data only.
- **no**: not there; the note says why.

| Agent | Chat | Send | Blocked card | Notification, herdr | Notification, tmux | Approve from a notification |
|---|---|---|---|---|---|---|
| Claude Code | device | device | device | device | device | lab on tmux (real prompt, key sent once); not yet on a phone |
| Codex | tests | tests | tests | tests | tests | tests |
| OpenCode | lab | lab | lab (Reject refused, see notes) | tests | tests | no: its prompt has no numbered options |
| Hermes Agent | tests | tests | no | tests | tests | no: no Blocked card |
| Pi | tests | tests | no: Pi has no Blocked dialogs | tests | tests | no: Pi has no Blocked dialogs |
| Oh My Pi | tests | tests | tests | tests | tests | no: its prompt has no numbered options |
| Grok Build | tests | tests | tests | tests | tests | no: its prompt has no numbered options |

Notes:

- OpenCode lab (2026-11-13, OpenCode 2.1.3, herdr 0.9.5, `scripts/agent-lab.py`): Chat read the real store, a Chat send
  went through, the card parsed real shell, edit and question prompts and answered a question; Stop, the input box
  check and modes matched. Reject on the card is refused because the app builds the card without the matched call
  (`toolUseIdFor`). Captures and tests: `packages/core/goldens/opencode/lab`.
- Codex lab: not run. The lab never copies the account's Codex login, and Codex needs one.

- Live Activity Approve and Deny need Claude Code or Codex prompts, like Approve from a notification, and open a confirmation sheet in the app. Tests only so far.
- herdr reports status for every program it has an integration for, so notifications through herdr need nothing per program.
- On tmux, notifications come from the hooks in `packages/plugin/src/install-program-hooks.js`.
- Grok Build's documentation does not say which `Notification` events exist; every one counts as an ask until a real run shows otherwise.
- Pi, Oh My Pi and Grok Build are not installed on the development Mac, so their hooks ran only against the shapes in their extension API and documentation.
