# 0024. The live transport is its own package

Status: accepted (2026-11-02)

## Decision

`packages/transport` (`@openagentspocket/transport`) is the live herdr transport: connection lifecycle,
requests, the events channel, channel admission, deadlines and error mapping over `modules/ssh`.
It depends on `packages/core` and `agentico-ssh`; nothing depends on it except `apps/mobile`.

## Why a separate package

- `packages/core` must stay pure TypeScript with no native imports (its `rootDir` and `types: []` enforce
  it, and its tests run with no React Native or Expo). The transport needs `agentico-ssh` (SshError, bytes,
  and the module types), which pulls in Expo. Putting it in core would break that rule; putting it in
  `apps/mobile` would make it untestable without the app and hide it from screens-as-composition.
- Core already owns every rule the transport applies (wire codec, `TransportError` taxonomy, host-key
  TOFU, route race, events channel and session, console projection). The transport is the adapter that
  feeds them real I/O, so core never imports it and tests of the rules stay fast.
- Tests run on `FakeSsh` (scripted exec and streamlocal) in plain Vitest; only the `expo` entry point of
  the module is stubbed (`vitest.config.ts`).

## How it is built

- **Host keys**: the module is always connected without a pin. Its `confirmHostKey` hook runs core's
  `verifyHostKey` (per-algorithm fingerprints, Host-keyed trust, mismatch without a prompt) under core's
  `HostKeyVerificationGate`. A refusal is remembered and reported as `hostKeyMismatch` or `hostKeyRejected`
  instead of the module's generic rejection. Authentication never starts before the key is accepted.
- **Route race**: core's `raceRoutes`. Because `SshModule.connect` verifies and authenticates in one call,
  the hook also claims the race: the first route whose key verified claims it and is the only one that
  authenticates; the others answer "no" and fail as `cancelled`. A claimant's failure (for example a bad
  login) is the connect's failure, as in Swift, not a route list.
- **Requests**: one `exchangeStreamLocal` per herdr request on an `ordinaryForwarding` slot (1 MiB bound,
  15 s deadline). A stopped server (`streamLocalOpenFailed`) is woken once through a shared exec and the
  request repeated once; `test -S` turns a missing socket into `socketNotFound`. HOME is probed only for
  relative socket locations and cached.
- **Events**: one `openStreamLocal` duplex handed to core's `openEventsChannel`; the Host keeps exactly
  one events slot. `SshTransport` satisfies core's `EventsTransport` and `ConsoleTransport`.
- **Admission, deadlines, shared operations**: ports of `SSHChannelAdmission` (8 forwarding, 1 events,
  4 session, 5 attach, 6 preview, 24 per connection), `AsyncDeadline` and `SharedAsyncOperation`. A
  deadline aborts the wait, so a hung native call releases its slot.
- **Errors**: `SshError` codes map to `TransportError` in one table for connect time and one for after.

## Not ported (listed as follow-up tasks)

- Jump Host routes: `SshModule` cannot layer a session over a forwarded channel; such a route fails as
  `jumpHostFailed(hostFeatureUnavailable)`.
- Native Windows Hosts (the exec-based API bridge and its session budget) and password / RSA credentials:
  the module authenticates with the device key only.
- `beforeDispatch` / `onDispatched` request hooks (used by Swift for confirmed worktree removal): the
  module has no write callback, so callers authorize before calling.
