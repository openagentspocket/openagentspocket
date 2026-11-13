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
  rewrites it when it refreshes tokens). Without a login in the lab HOME it shows its sign-in screen,
  so `--programs codex` is not usable yet. A login made inside the lab (`codex login --device-auth`
  in the lab's environment) would be a separate session that `stop` deletes; whether to allow that
  is the account owner's decision.

Captures worth keeping become fixtures under `packages/core/goldens/<program>/lab/`, read by
`packages/core/src/lab-captures.testkit.ts` (tests: `chat/opencode/lab.test.ts`,
`blocked/opencode-lab.test.ts`). Read every capture before committing it: no account names, home
paths, emails or tokens.

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
