#!/bin/bash
# Compiles the Notification Service Extension's Swift sources with a test harness and runs the
# shared envelope vectors through them. Needs macOS + swiftc. Usage: run.sh [output-dir]
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
target="$here/../../targets/notification-service"
vectors="$here/../../../../packages/plugin/test-vectors/notification-payload-v1.json"
out="${1:-$(mktemp -d)}"

# The widget extension compiles the same NotificationCore; the copies must not drift.
diff -r "$target/NotificationCore" "$here/../../targets/widgets/NotificationCore"

swiftc -swift-version 5 -o "$out/nse-tests" \
  "$target/NotificationCore/"*.swift "$target/Support/"*.swift \
  "$here/Tests.swift" "$here/main.swift"
"$out/nse-tests" "$vectors"
