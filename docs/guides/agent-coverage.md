# Agent coverage

What each Agent can do in the app, and how far that is proved. Update a cell when its proof changes.

- **device**: seen working on a real phone.
- **lab**: real program, on a test Host.
- **tests**: unit tests or synthetic data only.
- **no**: not there; the note says why.

| Agent | Chat | Send | Blocked card | Notification, herdr | Notification, tmux | Approve from a notification |
|---|---|---|---|---|---|---|
| Claude Code | device | device | device | device | device | lab on tmux (real prompt, key sent once); not yet on a phone |
| Codex | lab | lab | lab (Deny and a question; Approve not tried) | tests | tests | tests |
| OpenCode | lab | lab | lab (Reject refused, see notes) | tests | tests | no: its prompt has no numbered options |
| Hermes Agent | tests | tests | no | tests | tests | no: no Blocked card |
| Pi | tests | tests | no: Pi has no Blocked dialogs | tests | tests | no: Pi has no Blocked dialogs |
| Oh My Pi | tests | tests | tests | tests | tests | no: its prompt has no numbered options |
| Grok Build | tests | tests | tests | tests | tests | no: its prompt has no numbered options |

Notes:

- OpenCode lab (2026-11-13, OpenCode 2.1.3, herdr 0.9.5, `scripts/agent-lab.py`): Chat read the real store, a Chat send
  went through, the card parsed real shell, edit and question prompts and answered a question; Stop, the input box
  check and modes matched. Reject on the card was refused because the app built the card without the matched call;
  the card now matches the dialog to the conversation's waiting call (`blocked/request-match.ts`), so Reject on
  OpenCode's own permission sends Esc (tests; not yet seen live). Captures and tests:
  `packages/core/goldens/opencode/lab`.
- Codex lab (2026-11-13, Codex 0.167.0, herdr 0.9.5, `scripts/agent-lab.py`, a login made inside the lab): the probe
  and the simulator flows (`e2e/live`, screenshots `live-codex-*`) proved the Agent on Home, Chat reading the real
  rollout, a Chat send, the send hold on a draft and on a dialog, the card on a real command approval with Deny tapped
  (nothing ran), a Plan Mode question answered from the card, Default and Plan Mode from the footer, the shortcuts
  menu (Shift+Tab switched modes; Codex's overlay names Esc Esc; Esc stopped a turn, in the probe) and Usage through the plugin (tokens and the service limit). Found: Codex
  0.167 needs herdr's hook trusted before herdr reports a session; a code-mode command waiting for approval or declined
  has no Chat row; the mode chip says Default Mode while a Plan Mode question covers the footer (`docs/todo.md`, group
  3). Captures and tests: `packages/core/goldens/codex/lab`.

- Live Activity Approve and Deny need Claude Code or Codex prompts, like Approve from a notification, and open a confirmation sheet in the app. Tests only so far.
- herdr reports status for every program it has an integration for, so notifications through herdr need nothing per program.
- On tmux, notifications come from the hooks in `packages/plugin/src/install-program-hooks.js`.
- Grok Build's documentation does not say which `Notification` events exist; every one counts as an ask until a real run shows otherwise.
- Pi, Oh My Pi and Grok Build are not installed on the development Mac, so their hooks ran only against the shapes in their extension API and documentation.
