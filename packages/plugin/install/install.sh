#!/bin/sh
# OpenAgentsPocket installer for macOS and Linux:  curl -fsSL <base>/install.sh | sh
#
# Checks herdr, Node.js and SSH, installs or updates the plugin with herdr's own
# commands, then opens the Pairing Code. It never installs system software on its own:
# for anything missing it prints the next step and stops (herdr's installer runs only
# after a y/N prompt that defaults to no, and never without a terminal).
#
# Usage: install.sh [--dry-run]    --dry-run runs the read-only checks and only prints the rest.
set -eu

# Kept in sync with herdr-plugin.toml and packages/core (plugin-installation.ts) by
# packages/plugin/test/install-script.test.js.
PLUGIN_ID="agentico"
PLUGIN_VERSION="0.15.0"
MIN_HERDR_VERSION="0.7.5"
PLUGIN_REPOSITORY="openagentspocket/openagentspocket"
PLUGIN_REF="plugin"
MIN_NODE_MAJOR=20
HERDR_INSTALLER_URL="https://herdr.dev/install.sh"
HERDR_DOCS_URL="https://herdr.dev/docs/install/"

DRY_RUN=0
case "${1:-}" in
  --dry-run) DRY_RUN=1 ;;
  "") ;;
  *) echo "usage: install.sh [--dry-run]" >&2; exit 2 ;;
esac

say() { printf '%s\n' "$*"; }
step() { printf '\n==> %s\n' "$*"; }
stop() { printf '\nStopped: %s\n' "$1" >&2; shift; for line in "$@"; do printf '  %s\n' "$line" >&2; done; exit 1; }
# Prints the command, then runs it unless --dry-run.
run() { printf '+ %s\n' "$*"; if [ "$DRY_RUN" -eq 0 ]; then "$@"; fi; }
have() { command -v "$1" >/dev/null 2>&1; }
# The first x.y.z in the text, or nothing.
version_in() { printf '%s' "$1" | sed -n 's/^[^0-9]*\([0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\).*/\1/p' | head -n 1; }
# True when $1 >= $2, both x.y.z.
version_ge() {
  old_ifs=$IFS; IFS=.
  # shellcheck disable=SC2086
  set -- $1 $2
  IFS=$old_ifs
  [ "$1" -gt "$4" ] && return 0; [ "$1" -lt "$4" ] && return 1
  [ "$2" -gt "$5" ] && return 0; [ "$2" -lt "$5" ] && return 1
  [ "$3" -ge "$6" ]
}
ssh_is_on() {
  if have ssh-keyscan; then ssh-keyscan -T 2 127.0.0.1 2>/dev/null | grep -q .; return; fi
  have nc && nc -z 127.0.0.1 22 >/dev/null 2>&1
}

[ "$DRY_RUN" -eq 1 ] && say "Dry run: read-only checks run, nothing is installed or changed."

step "Checking herdr (version $MIN_HERDR_VERSION or newer)"
if ! have herdr; then
  if [ "$DRY_RUN" -eq 0 ] && [ -t 0 ] && [ -t 1 ]; then
    printf 'herdr is not installed. Run its installer (curl -fsSL %s | sh)? [y/N] ' "$HERDR_INSTALLER_URL"
    read -r answer || answer=n
    case "$answer" in
      y | Y | yes | YES) curl -fsSL "$HERDR_INSTALLER_URL" | sh ;;
    esac
  fi
  have herdr || stop "herdr is not installed (or not on PATH)." \
    "Install it: curl -fsSL $HERDR_INSTALLER_URL | sh   (more options: $HERDR_DOCS_URL)" \
    "Then open a new terminal and run this installer again."
fi
herdr_version=$(version_in "$(herdr --version 2>&1 || true)")
[ -n "$herdr_version" ] || stop "could not read the version of herdr." "Run: herdr --version"
version_ge "$herdr_version" "$MIN_HERDR_VERSION" || stop "herdr $herdr_version is older than $MIN_HERDR_VERSION." \
  "Update it: herdr update   (or through the package manager you installed it with)"
say "herdr $herdr_version"

step "Checking Node.js (version $MIN_NODE_MAJOR or newer)"
have node || stop "Node.js is not installed (or not on PATH)." "Install Node.js $MIN_NODE_MAJOR or newer: https://nodejs.org/"
node_version=$(version_in "$(node --version 2>&1 || true)")
node_major=${node_version%%.*}
{ [ -n "$node_major" ] && [ "$node_major" -ge "$MIN_NODE_MAJOR" ]; } || stop "Node.js ${node_version:-unknown} is older than $MIN_NODE_MAJOR." \
  "Install Node.js $MIN_NODE_MAJOR or newer: https://nodejs.org/"
say "node $node_version"

step "Checking SSH (the app connects over SSH)"
if ! ssh_is_on; then
  if [ "$(uname -s)" = "Darwin" ]; then
    stop "SSH is off on this Mac." "Turn on System Settings > General > Sharing > Remote Login, then run this installer again."
  fi
  stop "no SSH server answers on this machine." \
    "Install and start OpenSSH, for example: sudo apt install openssh-server && sudo systemctl enable --now ssh" \
    "Then run this installer again."
fi
say "SSH server is running"

step "Installing the plugin (version $PLUGIN_VERSION) with herdr"
run herdr plugin install "$PLUGIN_REPOSITORY" --ref "$PLUGIN_REF" --yes
if [ "$DRY_RUN" -eq 0 ]; then
  herdr plugin list --plugin "$PLUGIN_ID" 2>&1 | grep -q "$PLUGIN_VERSION" ||
    say "Note: herdr did not report plugin version $PLUGIN_VERSION; check: herdr plugin list --plugin $PLUGIN_ID"
fi

step "Showing the Pairing Code"
say "The QR opens as a popup inside herdr. If herdr is not running, start it and run the command below."
if ! run herdr plugin action invoke "$PLUGIN_ID.pair"; then
  say "Could not open the popup. Start herdr, then run: herdr plugin action invoke $PLUGIN_ID.pair"
fi

step "Done"
say "In the app, tap Add Host > Easy Pair with QR and scan the code."
