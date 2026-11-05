# UX1-easy-pair: Add Host flow with Easy Pair and a one-line installer
status: done
branch: easy-pair
changed: packages/ui (ChoiceSheet, CommandBlock, gallery entries `choiceCommand`), packages/core (`INSTALLER_BASE_URL`, `installerCommand`), packages/plugin/install (`install.sh`, `install.ps1`) and its test, apps/mobile (`/add-host` route, `AddHostSheet`, `EasyPairPanel`, `WhatHappensSheet`, `installerSteps`, `pairCommandLines`, `PairingScreen`, atlas `familyHosts.tsx`), i18n extras (en + es)
tests: pnpm verify-fast green (related suites; no full `pnpm test` by rule)
acceptance:
- Add Host opens a bottom sheet with Easy Pair with QR (recommended) and Add Manually: met. `hrefs.addHost()` is `/add-host`, a transparent modal over the current screen; its choices replace the route with `hrefs.easyPair()` or `hrefs.hostForm()`.
- ChoiceSheet and CommandBlock are generic packages/ui components with gallery entries and catalog rows: met.
- Easy Pair screen: camera, platform Segmented, CommandBlock from one function, What happens sheet, paste field (inside the scanner) and Add Manually kept: met. Windows adds the Windows guidance from `guideSteps('windows')`.
- One-line installer: `install.sh` and `install.ps1` written and tested with fake binaries (`--dry-run`); constants kept in sync with `herdr-plugin.toml` and core by a plugin test: met.
- Atlas `hosts.add-choice` (dark + Papel) and `hosts.pairing-scanner` recaptured: met (`design/atlas/rn-web/`).
left:
- Hosting: the lead serves `install.sh` and `install.ps1` at `INSTALLER_BASE_URL` (https://openagentspocket.com) once the domain is on Cloudflare. Until then the commands the app shows do not resolve.
- `PLUGIN_REPOSITORY` is still the placeholder `OWNER/agentico-app`; change it in core and in `install.sh` (a test compares them) when the repository exists.
- The installer pins the `plugin` branch and only warns when herdr reports another version; a per-version tag from the release flow would pin it for real.
- `install.ps1` only checks herdr 0.9.3+ and sshd (the plugin is macOS/Linux only); it has no test and shellcheck was not installed here, so `install.sh` was not linted.
- Opening Add Host from inside the Hosts modal stacks a second Hosts modal when the choice is replaced into `/hosts/pair` or `/hosts/form`; Cancel returns to the list.
notes: ChoiceSheet and CommandBlock replace the single-line CommandBlock that lived in features/hosts. `pairCommandLines(platform)` is the one place that lists the commands; swapping the installer is a change there and in core. `installerSteps(platform)` mirrors the script's steps for the What happens sheet. `entries.tsx` got one import and one spread for `familyHosts.tsx` (no hosts family file existed).
