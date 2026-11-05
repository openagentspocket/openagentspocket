# 0027. Session backends: herdr, tmux and what comes next

Status: proposed (2026-11-05)

## Context

The app has two axes that change independently. Programs are the agents (Claude Code, Codex, Pi, Grok, OpenCode). Session
backends are what keeps their terminals alive (herdr today, tmux next). Both are hard-wired: a program touches about 13
files, and `ConsoleTransport` returns generated herdr types. 135 non-test files in `packages/core` name herdr.

Being told when an Agent is blocked or done is the point of the product, also with the app closed. herdr gives that
through plugin events such as `pane.agent_status_changed`. tmux has no such event and does not know what an Agent is.

## Decision

- **Host side is required from the start.** A tmux Host without notifications is not the product, so tmux ships with a
  Host component, not as a bare SSH mode.
- **Notifications come from the agent, not from the backend.** The Host component registers in each program's own
  hooks (approval asked, turn finished) and pushes through the existing encrypted envelope and relay. The same path then
  works under tmux, herdr or anything else; herdr events stay as they are until this path has proved itself.
- **`packages/plugin` splits** into a backend-neutral core (keys, pairing, envelopes, push, usage) and thin entry points:
  the herdr plugin, and a standalone installer for Hosts without herdr.
- **Two registries.** `ProgramDefinition` per program; a session backend per multiplexer with its own neutral model
  (session, pane, Agent), declared capabilities, and herdr as the first implementation with no visible change. Screens
  read capabilities; no screen branches on a backend name.

## Order

1. Close what is open: settings-fixes, device install, the source of the stray `[object Promise]/` folder.
2. `ProgramDefinition`.
3. Neutral session model and backend contract, starting at `ConsoleTransport`; herdr behind it.
4. Split `packages/plugin`; program hooks as a notification source, proved first on herdr Hosts.
5. tmux backend: sessions, panes, read, send keys, attach, pairing through the standalone installer, a mark that tells
   backends apart.
6. Host data contract (git status and the like), then `useLayoutMode` before iPad.

## Open

- Which programs offer hooks for both approval and turn end. Where one has none, the Host component reads the screen.
- How to map a hook event to a tmux pane (process tree or `TMUX_PANE` in the hook's environment); to be proved in step 4.
- Whether Blocked parsers, which read the screen, work unchanged over `capture-pane`.
