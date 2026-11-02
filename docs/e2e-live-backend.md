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
