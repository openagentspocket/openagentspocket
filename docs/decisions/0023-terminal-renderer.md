# 0023: Terminal renderer: expo-libghostty

Date: 2026-11-02. Status: accepted (decided by the P3.0 spike; confirms 0017).

## Context

0017 chose expo-libghostty (MIT, the same libghostty as the Swift app) with xterm.js in a WebView as the
fallback, pending a spike on SDK 58. P3.0 ran both behind the same `TerminalView` props and `TerminalHandle`,
fed by `modules/ssh`'s PTY, on the iOS simulator (iPhone 17 Pro, iOS 26.5) and the Android emulator
(Pixel 3a AVD), against `isolated-herdr-backend.py start --plugin` (bash PTY; vim and top as TUIs).
Evidence: `docs/progress/evidence/P3.0-terminal-spike/`.

## Measured

| | libghostty iOS | xterm.js iOS | libghostty Android | xterm.js Android |
| --- | --- | --- | --- | --- |
| 16/256/truecolor, bold/italic/underline/inverse, CJK, emoji, box drawing | ok | ok (emoji overlaps the next cell) | ok | ok |
| alt screen (`?1049`) in and out, vim with syntax, top | ok | ok | ok | ok |
| resize round trip (view shrinks, grid, `stty size`) | 27-37 ms / 28-40 ms, matches | 39 ms / 55 ms, matches | 40 ms / 51 ms, matches | 65 ms / 73 ms, matches |
| typing (scripted keys, soft keyboard) | ok | ok | ok, in order | doubled and reordered characters (`ecchoo`, `adbadbdbb`) |
| 60 s of `yes` (colored), JS frame cadence | 173.1 MB, 2.89 MB/s, 0 frames over 33 ms, max gap 26 ms | 173.6 MB, 2.89 MB/s, 0 over 33 ms, max gap 30 ms, 99.6% parsed at the end | 173.1 MB, max gap 68 ms | 175.3 MB, max gap 57 ms |
| interrupt to prompt after the flood | 0.6 s | 0.7 s | 1.7 s | 1.8 s |

The Android frame counts (about 1,900 in 63 s, about half over 33 ms) are the emulator's own cadence, the same
for both renderers. Not measured: real devices (the WebView and Metal numbers will differ), selection by touch
(simulator input cannot drive it), an IME with composition (Japanese, dictation), the iPhone hardware keyboard.

## Decision

**expo-libghostty is the renderer.** It matches xterm.js on rendering and speed in the simulator, has no second
process and no HTML page to ship, shares its terminal emulation with the Swift app, and does not suffer the
Android soft-keyboard corruption xterm.js showed (xterm.js's hidden textarea fights the IME). `TerminalView`
loads it when the binary has the native view and falls back to `PlainTerminal` (tests, Expo Go, gallery, demo
mode). xterm.js stays only as the dev spike (`apps/mobile/src/dev/terminal`, `__terminal` route, bundle built by
`apps/mobile/scripts/build-xterm-bundle.mjs`, gitignored); promote it only if libghostty fails on a real Android
device.

## What the spike found in `modules/ssh` (fixed here)

These hit any renderer, and a terminal cannot ship without them:

1. **iOS crash under flood.** `SSHBridge` kept its event callback bare in `Locked<Value>`; every `withLock` read
   reabstracts the closure and writes it back wrapped in two more thunks, so each event deepened the call chain
   until the cooperative thread (512 KB) overflowed after a few thousand events (SIGBUS in `emit`). Now boxed in a
   class.
2. **No backpressure.** JavaScript cannot tell native to slow down; `yes` queued events faster than Hermes could
   run them (JS thread 100% busy, timers starved for minutes on iOS; `OutOfMemoryError` on Android in 12 s). Both
   pumps now cap a stream at 3 MB/s, so the reads pause, the SSH window fills and the remote blocks. iOS also
   coalesces reads for up to 8 ms or 128 KB per event.
3. **JS base64 was the load.** `fromBase64` in Hermes costs about as much as a 3 MB/s stream. `Stream.onEncodedData`
   hands the undecoded base64 to a consumer that forwards it (`TerminalHandle.writeEncoded`); bytes are decoded
   only if an `onData` listener exists. The terminal path never decodes in JS.
4. **Write order.** Native async functions run concurrently; fast typing reached the PTY out of order
   (`ecoh`). `BridgeStream.write` now serialises.

## Consequences

- P3.1 attaches with `stream.onEncodedData` and `handle.writeEncoded`, sends `onInput` through `stream.write`
  (already ordered), and calls `stream.resize` from `onResize`.
- Android's pipe backs up to 4 MiB then blocks JSch's session thread, which stalls every channel of that
  connection, not only the flooding PTY (noted in P1.1b). Acceptable for a terminal; revisit with per-channel
  windows if herdr events must keep flowing during a flood.
- The 3 MB/s cap is a constant in each pump (`maxBytesPerSecond`, `MAX_BYTES_PER_SECOND`); tune on a device.
- `TerminalHandle` gained `writeEncoded`; `createWriteBatcher` keeps one async write in flight.
