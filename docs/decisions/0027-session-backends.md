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
- **The session protocol is the backend contract.** The app already speaks NDJSON over a Unix socket through
  `direct-streamlocal`, and only about 11 files import herdr's types. So a backend does not get a new model inside the
  app: it gets a bridge on the Host (`packages/session-bridge`) that answers the same protocol. tmux maps cleanly: a
  session is a workspace, a window a tab, a pane a pane. herdr needs no bridge. A new multiplexer is a new bridge, and the
  app, its stores and its tests do not change. This replaces the earlier idea of a neutral model behind `ConsoleTransport`,
  which would have touched far more code for the same result.
- **Costs of that choice.** The protocol's owner is herdr, so the bridge pins a schema revision and must follow it; names
  in the app keep saying herdr. Methods a backend lacks answer `unsupported_method`, and screens must read declared
  capabilities instead of failing.
- **`ProgramDefinition` per program** (done), and no screen branches on a backend name.

## Order

1. Close what is open: settings-fixes, device install, the source of the stray `[object Promise]/` folder.
2. `ProgramDefinition`.
3. Session protocol as the contract: `packages/session-bridge` maps tmux to it and is pinned by the app's own decoder (done,
   tested on a real tmux 3.8 too).
4. Program hooks as a notification source: `notify-delivery.js` is backend-neutral; `program-hook.js` and its installer
   cover Claude Code (fired by a real one), Codex, OpenCode and Hermes (from their documented formats, not fired by the
   real programs). It stays quiet inside herdr. Still to do: other programs, approval fields, the standalone package.
5. tmux end to end. The Host presents itself as a relocated herdr: the app already takes an endpoint (socket plus an
   executable that behaves as `herdr`, ADRs 0023 and 0029 of the Swift app), so connect, attach and device registration
   need no app change. Done: socket server, change events by polling, launcher, `install`, `pair` (the plugin's ceremony,
   unchanged, run as for a relocated herdr). To do: starting the bridge at login, backend capabilities and
   the mark that tells backends apart. Proved on the simulator against a user-level `sshd` on localhost: pairing, enrollment, Console,
   Agent detail and attach, through the app's own SSH module. Push is not: a simulator has no token.
6. Host data contract (git status and the like), then `useLayoutMode` before iPad.

## Open

- Which programs offer hooks for both approval and turn end. Where one has none, the Host component reads the screen.
- How to map a hook event to a tmux pane (process tree or `TMUX_PANE` in the hook's environment); to be proved in step 4.
- Which methods the app needs before a Host is usable (`events.subscribe` is not in the bridge yet), found by connecting it.
- How to name agents that run under `node`, whose `pane_current_command` says nothing; hooks should report it.
- Hermes Chat: its sessions live in `~/.hermes/state.db` (`sessions`, `messages`), so a reader looks like OpenCode's, about 5,700 lines. Not started: no live Hermes session to read, and how herdr names one is unknown.
- Whether Blocked parsers, which read the screen, work unchanged over `capture-pane`.
