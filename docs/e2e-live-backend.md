# Agent lab: real programs on a throwaway Host

`scripts/agent-lab.py` runs real coding agents in a throwaway herdr behind its own sshd, so the app's
code can be proven against the real programs instead of hand-made fixtures. Everything lives under
`/tmp/oap-lab` with a constructed environment: its own HOME (also `XDG_*` and `CODEX_HOME`), a
throwaway git repository the Agents work in, an sshd on 127.0.0.1 with its own `authorized_keys`.
herdr's integration for each program is installed into the lab HOME only. Nothing reads or writes
the account's own configuration, sessions or credentials.

```sh
python3 scripts/agent-lab.py start --programs opencode --plugin   # herdr, sshd, plugin, one Agent per program
python3 scripts/agent-lab.py status                               # processes, Host settings, logins
python3 scripts/agent-lab.py probe --step 01-idle                 # the app's code against every Agent
python3 scripts/agent-lab.py stop                                 # stops everything, removes the root
```

`probe` runs `packages/transport/src/lab/live-lab.test.ts` (skipped unless the lab is up). It
connects through the lab's sshd as the app does (`SshTransport`: exec channels, direct-streamlocal
to herdr; SFTP is read from the lab's disk instead) and, for each Agent, writes to
`/tmp/oap-lab/captures/<step>/<program>/`: `screen.ansi` (the `agent.read` the Blocked card reads),
`store-N.out` (each Chat store query's output) and `report.json` (herdr's record, the parsed
dialog with the plan of each option, the input box check, the mode, the shortcuts and Chat's read
of the conversation). One action may follow the probe, done the way the app does it:

- `--send TEXT`: Chat's send rules and input box check, then `agent.prompt`.
- `--keys esc,shift+tab`: `agent.send_keys`, as a shortcut does.
- `--answer N`: taps option N on a Blocked card built over the pane. It taps only a Deny, Reject or
  Cancel option, or a question's answer; an approve option is refused in code.
- `--stop`: Chat's Stop (the program's screen guard, then its Stop keys).
- `--usage`: reads Usage through the plugin (start with `--plugin`).

Prompts in the terminal go through the lab's herdr: `python3 scripts/agent-lab.py herdr -- agent
prompt oc "Reply with the single word pong." --wait`. Keep prompts short and harmless; they run in
the throwaway repository with the programs asking before they act.

Programs:

- **OpenCode** runs as `opencode --standalone` (a private server, never the account's background
  service) on OpenCode's free models, which need no account. The repository's `opencode.json` sets
  `bash`, `edit` and `webfetch` to `ask`.
- **Codex** needs a login, and the lab never copies or links the account's `auth.json` (Codex
  rewrites it when it refreshes tokens). Without a login in the lab HOME it shows its sign-in screen.
  The account owner (or the lead) logs in inside the lab, a separate session that `stop` deletes;
  a worker never runs a login or logout. The lab runs Codex with `approval_policy = "on-request"` in
  a read-only sandbox, so a write such as `touch scratch.txt` asks.
  Two steps by hand after the login, in the pane: restart the Agent (Ctrl+C, then `agent-lab.py herdr
  -- agent start cx --kind codex --pane w1:p1 -- -c check_for_update_on_startup=false`), and on
  Codex 0.167's "Hooks need review" choose Review hooks, check that the only hook is herdr's
  `herdr-agent-state.sh` under the lab HOME, and press `t` to trust it. Codex documents no config
  key for this (only `--dangerously-bypass-hook-trust`, which runs every enabled hook untrusted, per invocation). Without the trust
  herdr never reports the session and Chat cannot bind (`goldens/codex/lab/no-session-without-hooks.ansi`).

The app in the simulator against the lab is one command (simulator `2798C301`, Metro on 8088, the
installed Debug build; it never builds):

```sh
python3 scripts/agent-lab.py sim            # all of e2e/live for the lab's program; screenshots design/atlas/sim/live-*
python3 scripts/agent-lab.py sim --flows 04 # again on an app already set up
```

It runs `scripts/sim-verify.mjs --live`: flow `01` copies a fresh app's Device Key line, the lab
reads it from the simulator's pasteboard into its own `authorized_keys`, sends OpenCode's first
message in the terminal (its home screen takes none from Chat), then flows `02` to `07` add the Host,
read and send in Chat, meet a real permission and a real question on the Blocked card, switch modes
and open Usage. A flow taps a card option only by its id and exact label, after asserting the card's
title and its options; no flow approves anything.

The flows are one set for every program: `sim` writes the program's texts (the Blocked prompt, the
card's title, the approve option it asserts and the deny option it taps, the mode names, the Usage
card) into Maestro's variables from `SIM_PROGRAM` in `agent-lab.py`, and screenshots are named
`live-` (OpenCode) or `live-codex-`. With more than one program in the lab, pass `--program`. For
Codex the lab starts a new conversation (`/new`) and sends the first message in the terminal; `05`
switches Codex to Plan Mode first (Codex asks questions only there) and back after.

State (2026-11-13), Codex 0.167.0: `01` to `07` pass, `04` on a second run: asked only to run
`touch`, Codex tried it in the sandbox and reported the failure without asking, so the prompt now
tells it to request approval. Deny taps "No, and tell Codex what to do differently" (`3`); nothing
was ever approved and `scratch.txt` was never created.

State (2026-11-13): `01` to `07` pass against OpenCode 2.1.3 (OpenCode's free model), in one run of
`agent-lab.py sim`. `02` trusts the lab's key from "Trust this Host?" on the Host's sheet right after
Save; `04` taps Reject on OpenCode's own permission, which sends Esc and the card goes away. An Agent
that needs nothing is on Home's Sessions strip (`session-<host id><separator>w1:p1`), not the inbox.

`run -- <command>` runs a program's own command in the lab environment, attached to the terminal
(for example `agent-lab.py run -- codex login status`).

Captures worth keeping become fixtures under `packages/core/goldens/<program>/lab/`, read by
`packages/core/src/lab-captures.testkit.ts` (tests: `chat/opencode/lab.test.ts`,
`blocked/opencode-lab.test.ts`, `chat/codex/lab.test.ts`, `blocked/codex-lab.test.ts`).
`agent-lab.py keep <step>/<program>/<file> <program> <name>` copies one there redacted: account
and user ids, plan, time zone, the user name, the home path and the host name are replaced; long
texts (instructions, skills) are cut and tool lists emptied (they name the account's apps). Read
every capture before committing it anyway: no account names, home paths, emails or tokens. Never
capture Codex's `/status`; it shows the account.

# Live end-to-end against the isolated backend

`e2e/live.yaml` needs a throwaway herdr + sshd that the device can reach. The Swift repo ships one:
`scripts/isolated-herdr-backend.py` (all under a short root such as `/tmp/agentico-iso`, nothing personal).

1. `python3 scripts/isolated-herdr-backend.py start` then `status`: it prints the SSH port, the user and the
   host-key fingerprint. Pass them to Maestro as `-e HOST=<address> -e PORT=<port> -e USER=<account>`
   (the flow has no defaults on purpose; a default in the YAML would override the `-e` values).
2. Authorize the device key. The Device Key has no other path to `authorized_keys`:
   - open Hosts, Add Host: the Authentication section shows the key's line with "Copy authorized_keys Line";
     paste it into `python3 scripts/isolated-herdr-backend.py authorize '<line>'`; or
   - from the Mac, with the simulator booted, copy the line the same way and pipe `pbpaste` to `authorize`.
3. Give Home something to show. The backend starts with workspace `w1` and pane `w1:p1` but no Agent until one
   reports in:
   `python3 scripts/isolated-herdr-backend.py run -- pane report-agent --source verify --agent claude --state working w1:p1`
4. `maestro test -e HOST=... -e PORT=... -e USER=... e2e/live.yaml` on a build without `EXPO_PUBLIC_DEMO`.

Notes: on the Android emulator the Mac is `10.0.2.2`. The first connect asks "Trust this Host?" once; compare the
fingerprint with the one `status` printed.

## Demo build for e2e/hosts.yaml

`e2e/hosts.yaml` and `e2e/home.yaml` expect scripted data: the offline probe answers "Trust this Host?" without SSH.
They need a build with demo mode compiled in, not the live build used above:

```
EXPO_PUBLIC_DEMO=1 npx expo run:ios --configuration Release     # or: run:android --variant release
maestro test e2e/hosts.yaml
```

(`EXPO_PUBLIC_DEMO` is inlined at bundle time; a Release/Debug build made without it is a live build and
`hosts.yaml` stops at the missing trust prompt.) Native builds are the integrator's.
