# agentico-ssh

Expo Module for device keys and the six SSH primitives (see `src/types.ts`):
connect with Host Key policy (pin / TOFU) and Ed25519 auth, exec, direct-streamlocal
(one-shot and duplex), PTY with resize, SFTP, direct-tcpip (duplex and a 127.0.0.1 forward).

| Path | What |
|---|---|
| `src/types.ts` | The public API (`SshModule`, `SshSession`, `Stream`, `Sftp`) |
| `src/client.ts` | `createSshClient(bridge)`: the API over the raw native bridge (`src/bridge.ts`), Host Key policy before auth |
| `src/native.ts` | `nativeSsh()`: the client over `requireNativeModule('AgenticoSSH')`, loaded on first use |
| `src/fake.ts` | `FakeSsh`: in-memory, same semantics, for tests and Demo mode |
| `ios/` | iOS: the Swift `AgenticoSSH` package (libssh2 + OpenSSL XCFrameworks) and the Expo bridge in `ios/Module` (Apache-2.0, see `ios/NOTICE`) |
| `android/` | Android: the same bridge in Kotlin over JSch (mwiede) + BouncyCastle, with its own SFTP v3 client (Apache-2.0, see `android/NOTICE`) |
| `scripts/harness-fixture.py` | Local targets for the integration harness (apps/mobile route `__ssh`) |

Both platforms implement the same contract (`src/bridge.ts`); the TypeScript above them is shared.

## Rules the bridge keeps

- Private keys never reach JavaScript: `generateKey(alias)` creates an Ed25519 key on first use and
  returns only the `ssh-ed25519 AAAA...` line. iOS keeps it in the Keychain (this device only);
  Android keeps the seed wrapped by an Android Keystore AES-GCM key in the no-backup directory.
- Authentication starts only after the Host Key was accepted: a pin must match
  (`hostKeyMismatch`), else `confirmHostKey` decides (`hostKeyRejected`), else trust on first use.
- Bytes cross the bridge as base64; stream bytes arrive as `onStreamData` events, starting at the
  first `onData` listener, so nothing is lost and an unread channel holds the server back.
- Every failure is an `SshError` with a stable `code` (`src/errors.ts`).
- SFTP `write` creates and fails if the file exists; `{ replace: true }` stages a sibling and
  renames it over atomically. herdr API requests use one channel each, 1 MiB, 15 s by default.

## Android notes

- JSch connects in one call; a `HostKeyRepository` gate holds its handshake thread at the Host Key
  until `authenticate` (accept) or `disconnect` (reject), so the two-step contract holds.
- SFTP does not use JSch's `ChannelSftp` (it globs paths, renames with overwrite, cannot create
  exclusively): `SftpClient.kt` speaks SFTP v3 on a subsystem channel, reads and writes pipelined.
- Stream bytes wait in a pipe until `startStream`; past 4 MiB unread, JSch's session thread waits
  too, which holds back every channel of that connection (iOS holds back only that channel).

## Integration run (iOS simulator)

```sh
python3 <Agentico repo>/scripts/isolated-herdr-backend.py start --plugin   # prints port, user, host key
python3 modules/ssh/scripts/harness-fixture.py --http-port 47451 --socket <short path>/fx.sock \
  --out <evidence dir> --authorize-cmd "python3 <Agentico repo>/scripts/isolated-herdr-backend.py authorize"
pnpm -F @agentico/mobile ios
xcrun simctl openurl <udid> "agentico:///__ssh?host=127.0.0.1&port=<port>&user=<user>&sock=<herdr socket>&fsock=<fx.sock>&fport=47451&pin=<SHA256:...>&auto=1"
```

The harness posts each step to the fixture (`harness.log`) and the final report
(`harness-report.json`). Stop the backend afterwards (`isolated-herdr-backend.py stop`).

## Integration run (Android emulator)

The same backend and fixture; the emulator reaches the Mac's loopback at `10.0.2.2`, and
`adb reverse` gives the harness its `127.0.0.1` fixture port:

```sh
adb reverse tcp:47451 tcp:47451
pnpm -F @agentico/mobile android
adb shell am start -a android.intent.action.VIEW \
  -d "'agentico:///__ssh?host=10.0.2.2&port=<port>&user=<user>&sock=<herdr socket>&fsock=<fx.sock>&fport=47451&pin=<SHA256:...>&auto=1'"
```
