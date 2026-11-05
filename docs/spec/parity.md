> Adapted from the research spec. Items marked (unverified) were not checked against code or a live system.

# Parity spec: the React Native app versus the native iOS reference

Reference: the original native iOS Agentico app (Swift). Paths below are relative to that repository and are kept as pointers for contributors who have it.
Read: CONTEXT.md (headings), architecture.md, features/README + every feature file's `###`/`##` structure and the
sections cited, screens.yml (172 screens, 79 distinct feature ids referenced + 12 `non_ui_features`), ADR titles +
decisions of 0002/0004/0007/0008/0011/0012-0018/0020-0030, herdr-schema.json + generate-wire-types.py, plugin/README
(headings, pairing, registration, notify, usage), relay/README + worker.js, fork.md. NOT read in full: navigation.md,
herdr-compatibility.md, the other ADRs, individual Swift reducers/parsers (line counts only). Everything marked
(unverified) was not checked against code or a live system.

Scale: `Sources/Agentico` 150k Swift lines (363 test files / 148k lines under Tests/), extensions 6.8k, AgenticoSSH 8.9k,
AgenticoOverlay 3.9k. Plugin 6.6k JS (+42 test files) and relay (~700 JS + 3 tests) already JS: they carry over untouched.

---------------------------------------------------------------------------------------------------------------------
## 0. Findings that change the plan (read first)

1. **The riskiest dependency is not UI, it is SSH.** The whole app speaks to herdr over OpenSSH
   `direct-streamlocal@openssh.com` channels (ADR 0011; socat fallback was deliberately removed). No RN SSH library I
   know of exposes it (react-native-ssh-sftp = NMSSH/JSch wrapper: exec, shell, SFTP only; (unverified) mwiede/jsch,
   sshj and Apache MINA may have a streamlocal channel). A custom native module is unavoidable. Decide with a spike
   (item 1.1) before anything else.
   - iOS: reuse `Packages/AgenticoSSH` as-is (8.9k Swift, pinned libssh2 + OpenSSL XCFrameworks, 6k-line `SessionDriver`).
   - Android: either (a) a JVM SSH lib that has streamlocal, (b) libssh2 at the same pin via NDK + a JNI driver (a
     rewrite of the 6k-line driver; same wire behavior on both OSes), or (c) fall back to ADR 0002's
     `exec socat - UNIX-CONNECT:<sock>` per request on Android only (works with any lib; reintroduces the socat
     prerequisite and one extra exec channel per request).
2. **The Swift tests cannot be reused as tests; only their data can.** The 363 test files are XCTest/swift-testing.
   Reusable data: `Tests/AgenticoTests/ChatFixtures` (2.7 MB; 5 programs; 217 files in `screens/` = captured terminal
   dialogs for the Blocked parsers) and the 9 `plugin/test-vectors/*.json` (the only truly cross-language contracts:
   pairing v1/v2, notification payload/session, approval preview, live-activity content, plugin version, sidebar
   layout, usage). Assertions must be re-expressed in vitest. **Recommended oracle (needs a Swift-repo change, so lead
   must approve):** a one-off Swift test target that dumps golden JSON (ChatTranscript per fixture, dialog parse result
   per screen fixture, usage projections) so the TS ports are checked by differential testing against the reference
   instead of hand-written expectations.
3. **Screenshots cannot be pixel-compared.** `design/screens/current/*.png` (127 files, not 172) are the old Swift
   look; RN uses a new palette/density. Screenshot acceptance below means "same elements, states and copy present",
   verified by Maestro `assertVisible` on the strings in screens.yml `states:`, plus an eyeball screenshot.
4. **Push is half-built even on iOS.** fork.md: the personal Apple team cannot sign Push Notifications (no
   `aps-environment`), and the default relay `http://127.0.0.1:8787` "needs a small Node HTTP wrapper that does not
   exist yet". So Phase 5 on iOS needs a paid team; Android needs a Firebase project + service account on whatever
   hosts the relay. The in-app banner path (foreground, driven by the events stream) works without any of this.
5. **Plugin install from the app is already broken in the fork** (the original GitHub repo the install step pointed at does not exist).
   Hosts use `herdr plugin link`. Port the UI, expect the install action to fail until the repo exists.
6. **Chat is 27% of the code (39.9k Swift).** Scope it by program: Claude + Codex first (~9k Swift of readers),
   then Pi/OMP, Grok, OpenCode. Blocked-card parsers likewise (Claude 780, Codex 550 first).
7. Expo constraints: custom native code => dev client/prebuild, never Expo Go. Phase 6 targets (widgets, NSE,
   Live Activity, Watch) live outside the JS tree; use a config plugin (e.g. expo-apple-targets, (unverified) maturity).

---------------------------------------------------------------------------------------------------------------------
## 1. Domain model and protocol layer to port

Proposed boundary: **`packages/core` = pure TypeScript, zero RN imports** (everything marked PORT below, runnable
under vitest/node against fixtures); **`modules/ssh` = Expo native module** (five primitives below); app code
(screens, stores wiring) on top. `Transport` stays the single interface the UI sees (same rule as Swift ADR 0011), so
a `FakeTransport` (fixtures) gives Demo mode, unit tests and Maestro determinism: it replaces `Sources/Agentico/Demo`
(4.2k lines) and `Transport+Testing`.

### 1.1 Native module surface (everything else is TS over these)
Derived from `Packages/AgenticoSSH` public API (`SSHConnection.swift` 627, `SSHSFTPClient.swift` 367, `PublicTypes.swift`):
| Primitive | Used by |
|---|---|
| `connect(endpoint, {jump?}) -> hostKey`, `authenticate(password \| ed25519 sign)`, `close()` | route race, host-key TOFU, pairing |
| `exec(cmd, timeout) -> {stdout, stderr, exit}` (+ `openExec` streaming, for `executeResponseLine` enrollment) | CLI calls, git, POSIX scripts, usage probe, plugin steps, OpenCode sqlite |
| `exchangeStreamLocal(sock, bytes) -> bytes` and `openStreamLocal(sock)` duplex | every herdr RPC (1 channel/request, <=1 MiB, 15 s) and `events.subscribe` |
| `openPTY(cmd, cols, rows)` duplex + `resize` | Attach, shell terminals |
| SFTP: stat, list, readRange, open for read/write streaming, rename (atomic + no-overwrite), unlink, rmdir, mkdir, chmod | Chat transcripts, Files, staging, config files |
| `openTCPChannel(host,port)` + loopback listener (`PortTunnel`) | Ports preview |
Byte streaming across the bridge: base64 events at first; JSI typed arrays if terminal throughput needs it (unverified).
Algorithms/limits to keep: ed25519 + ecdsa + rsa-sha2 host keys, `rsa-sha2-512` user auth only, channel admission
budgets (forwarding 8, events 1, session 4, attach 5, total 18; `SSHChannelAdmission.swift` 279 PORT as TS queue),
`MaxSessions`-aware bounded queue. Keep "key never crosses into the lib": needs a decision: sign in JS
(@noble/curves) via async callback during auth, or pass the seed to native for the auth call only (simpler).

### 1.2 Protocol and transport (PORT to TS unless noted)
| Concern | Swift owner (lines) | RN plan |
|---|---|---|
| Wire types | `Transport/Generated/HerdrAPITypes.swift` 1425, generated by `scripts/generate-wire-types.py` 442 from `scripts/herdr-schema.json` (10.7k, 40 methods in METHODS) | Re-generate TS types from the same schema (port the $ref flattening, ~60 lines, + json-schema-to-typescript or small emitter). String enums as open unions (`'idle'\|...\|(string&{})`): herdr has no stability guarantee, unknown values must survive. Add `--check` in CI like the Python one |
| Envelope + methods | `HerdrWire.swift` 144, `HerdrEvents.swift` 157, `JSONValue.swift` | PORT (`{"id","method","params"}\n`, success must match id, errors tolerated with empty ids; `local.events_dropped` is synthesized client-side) |
| Transport interface | `Transport.swift` 444 (68 members) | PORT as `Transport` TS interface; implementation = `SshTransport` (RPC via streamlocal) |
| Error model | `TransportError.swift` 207, `+Presentation` (Summary/Detail/Recovery), `+ErrorMapping` 138, `ErrorDescriptions` | PORT; `isRetryable` is the single retry decision; apiRejected retryable; host-key security failure stops retries |
| EventsSession | `EventsSession.swift` 1171 (+`AgenticoSSHTransport+Events` 225) | PORT (biggest transport item): resume/suspend/end/retry/revalidate, backoff 1 s x2 to 30 s unlimited, keepalive `ping` 30 s unless traffic, snapshot-after-connected obligation, bounded buffer (overflow sheds oldest + `.eventsDropped`), pane-scoped subscriptions dropped on reconnect, version FLOOR 17 (never equality; 22 advisory) |
| Route race | `RouteRace.swift` 211, `SSHTransportSettings`, `AgenticoSSHHostKeyVerifier`, `HostKeyPolicy`, `KnownHostsStore`, `HostKeyFingerprint` | PORT: direct routes first, others after 400 ms stagger, verified-host-key gate serialized, "may name another machine" private/LAN/.local excuse rule for changed keys |
| Cold start | `withColdStartWake` in `+Requests` 219 | PORT: `herdr remote-client-bridge` wake once, `socketNotFound` vs combined non-retryable `streamLocalOpenFailed` |
| Host scripts / CLI | `+HostScripts` 184, `+HostCommands` 169, `+HostEnvironment` 105, `HerdrHostPath` 198, `RemoteHostPath` 141, `HerdrCommandLine` 89, `NodeToolchainProbe` | PORT (POSIX sh strings + quoting rules; endpoint launcher as positional args; path rule rejects `'`, `\`, control chars) |
| Plugin ops | `AgenticoPlugin.swift` 510, `AgenticoPluginInstallation`, `+Plugin` 147, `+PluginConfigFiles` 412 | PORT; vector `plugin-version-v1.json` |
| Staging | `+Staging` 326 (images/files over SFTP, ADR 0006) | PORT on SFTP primitives |
| Windows hosts | `WindowsTerminalChannel`, `remote-api-bridge` (ADR 0018) | DEFER (same exec primitives, later) |
| Generated total transport | Transport/ 12.9k Swift | expect ~5-6k TS (estimate) |

### 1.3 Identity, hosts, pairing, security
| Concern | Swift owner | RN plan |
|---|---|---|
| Host, Route, HostDraft/Store | `Hosts/Host.swift` 383, `HostDraft` 252, `HostStore` 237, `HostRouteFields` 466 | PORT + persist (MMKV/zustand-persist); keep route-id-of-first-route == host id compat rule only if importing old data (not needed: fresh app) |
| Credentials | `HostCredentialsProvider` 90, `DeviceKey`/`DeviceKeyStore`/`SecretStore` (Keychain), `RSAKey*` (ADR 0019) | expo-secure-store; Ed25519 via @noble/curves; **RSA: defer** (password + ed25519 first) |
| Pairing | `Pairing/PairingCode.swift` 226, `PairingCeremony` 123, `SSHPairingConnector` 361, `PairingScanStore` 335; plugin side already JS | PORT code/ceremony; vectors `pairing-code-v1/v2.json` (decode strictly: prefix `HERDR-PAIR:`, version 1 or 2, base64url, field rules). Enrollment = `executeResponseLine("agentico-enroll", deviceKeyLine)` -> `HERDR-ENROLL:OK:<fp>`; reject Tailscale SSH banner (`SSH-2.0-Tailscale`) before host-key compare; Host persisted only after verified Device-Key reconnect |
| Preflight | `Preflight.swift` 288, `HostOnboardingStore` 570 | PORT: ping chain + plugin.list |
| Notification crypto | `AgenticoNotificationCore` 842 (`SealedEnvelopeCodec`, AES-256-GCM, AAD `HERDR-NOTIFY:1`, kid = first 8 bytes SHA-256 of key) | PORT with @noble/ciphers + hashes; vector `notification-payload-v1.json` |
| App lock / key gate | `Security/` 735 | expo-local-authentication + secure-store `requireAuthentication` |

### 1.4 Console state (PORT, pure)
`HostConsoleProjection.swift` 1115 (snapshot is truth, events are hints; epoch invalidation; re-apply deltas newer than
the request; one resync at a time + one pending), `ConsoleAgent` 338 (`consoleSorted`: pin rank -> status bucket
Blocked0/Done1/Working2/Idle3/other4 -> host -> `stateChangeSeq` -> workspace -> pane id), `AgentRowLayout*` ~600
(Row Slot fields), `PinnedAgentsStore`, `StatusInbox/*` 1019 (`StatusInboxProjector` 252, clocks 220), `ConsoleStore*`
~2.4k (split across Actions, HostLifecycle, HostReads, Usage, Chat), `AgentComposerStore` 740 + `ComposerDeliveryPolicy`,
`RemoteDirectoryBrowser`, `RecentDirectories`, `StartAgentStore`, `WorktreeDetailStore`, `RenameStore`, `ClosePaneStore`.
Plan: one zustand store per Host (`HostSession`: transport, projection, status) + a derived `selectConsole()`; vitest
against fixtures. Tests: `ConsoleStoreTests`, `EventsSession*Tests`, `StatusInbox*Tests` are the checklists to port.

### 1.5 Chat engine (PORT, pure; largest block)
| Piece | Swift (lines) | Fixtures / notes |
|---|---|---|
| Neutral model + framing | `ChatTranscript` 287, `ChatLineFramer` 147, `ChatRow*`/`ChatRowBuilder` | UI never parses transcripts: reducers emit program-neutral entries; unknown records skipped; reducer `revision` bump drops cache (Claude 14, Codex 11, Pi 10, Grok 8, OpenCode 1) |
| Claude | `Chat/Claude/` 4137 (Locator 391 in Source/) | fixtures `claude/*` (5 files); `parentUuid` tree, current-branch choice, subagent + workflow journals, `tool-results/` path rules |
| Codex | `Chat/Codex/` 4863 (+Locator 127) | `codex/*`; paginated vs legacy dialect from line-1 `session_meta`; prefix classifier avoids decoding multi-MB lines |
| Pi/OMP | `Chat/Pi/` 865 | `pi/*`, `omp/*` |
| Grok | `Chat/Grok/` 2171 (+Locator 213) | 12 fixtures |
| OpenCode | `Chat/OpenCode/` 2883 (sqlite via exec; SQL slimmed on the Host) | 8 `rows-*` fixtures; needs only `exec` |
| Following/engine | `TranscriptFollower` 348, `ChatConversationEngine` 943, `AgentChatStore*` ~1.7k, `ChatHostFiles`, `ConversationReference` | 1 MiB tail via SFTP range, identity by head/anchor bytes (no inode on SFTP v3), 1 s poll (OpenCode 2 s), send witness (`ChatSendWitness*` 450) |
| Blocked card | `Chat/Blocked/` 7690: parsers Claude 780, Grok 560, Codex 550, OMP 401, OpenCode 369; `DialogActionPlanner` 451 + per-program planners; `BlockedAnswerExecutor` 286; `BlockedCardStore` 814; `DialogFingerprint`; `QuestionForm` | 217 screen fixtures in `ChatFixtures/screens/<program>`; safety invariants must be ported verbatim (fingerprint recheck, 150 ms grace / 650 ms OMP, never resend, 3 s `unconfirmed`, keys via `agent.send_keys`/`pane.send_input` only) |
| Cache | `Chat/Cache/` 851 (on-device JSON per conversation) | MMKV/file; keep revision-drop rule |
| Timeline projection | `ChatTimelineProjection` 510, `ChatConversationStatus` 411, `ChatTimelineGeometry/Layout` (view-ish) | PORT projection; layout/geometry replaced by FlashList |
| Markdown | `ChatMarkdown` 806 + view 304 | **replace with a library** (marked/remark -> RN renderer); do not port |
Chat total Swift 39.9k (logic ~32.6k by a crude file-name heuristic, UI ~7.3k). Estimate TS 12-16k.

### 1.6 Other pure logic
- **Usage:** app side `AgentUsageReport` 319, `AgentUsageScope` 270, `UsageQuickSheetPresentation` 243 (pace, 80/95 levels),
  `AgentUsageProbe` 95 (nonce-framed script output, 1 MiB cap), `AgentUsageStore` 687, `UsageAccountFile` 301
  (`^[A-Za-z0-9_-]{8,32}$`, max 3 added accounts). Computation is plugin-side JS (already JS). Vector `usage-v1.json`
  (consumed by `AgentUsageTests`, hard-codes price expectations).
- **Changes/git:** `GitProbe*` ~1.0k (porcelain/numstat/patch parsers `GitProbe+PatchParser` 253), `CheckoutChanges` 471,
  `ChangesStore` 343 + AutoRefresh 239. All POSIX scripts over exec -> PORT; diff rendering new.
- **Files:** `FileBrowserStore` 604, `RemoteFileBrowsing` 242, `FilePreparer` 168, downloads 135; SFTP + bounded `check-ignore` exec.
- **Terminal logic:** `AttachLinkIndex` 478, `AttachUserMessageIndex` 533 (message jump), `TerminalByteFeed`, `AgentAttachStore` 715,
  `AttachTerminalStore` 541 (reattachLimit 2), `TerminalConnectionPool`/`RetentionBudget` (5 terminals, 300 s idle),
  `TerminalKeyboard*` ~700, `HerdrStartupProbeFilter` (drop DECRQM/DA1 query), snippets/skills stores (~1.1k), `AgentContextUsage`.
- **Notifications:** `NotificationRegistrationFile` 455 (`notifications.json` v1, atomic replace, one entry per token+session),
  `NotificationPreferencesStore` 384, `ApprovalActionRunner` 366 + `ApprovalApply` 175 + ledger, `AgentNotificationRouter`/`AgentRoute` (deep links
  `agentico://agent/<hostUUID>[/<paneID>]`). Vectors: `notification-session-v1.json`, `approval-preview-v1.json`.
- **Live Activity content** (iOS-only consumer) `AgentActivityContentBuilder` 221 + `live-activity-content-v1.json`: only if Phase 6.

### 1.7 Line estimates (Swift, wc -l; "ui" = files whose name contains View/Sheet/Row/Card/Menu/Bar/Pane/Chrome, crude)
| Area | Swift | of which ui | RN fate |
|---|---|---|---|
| Chat | 39,892 | 7,272 | port (1.5) |
| Console (lists, home, detail, composer, attach, stores) | 34,844 | 15,617 | port; UI shrinks via shared components |
| Transport | 12,944 | 0 | port (1.2) |
| AgenticoSSH pkg | 8,877 | | iOS reuse as-is; Android new |
| Terminal | 8,495 | 2,622 | WebView xterm + port logic |
| Settings | 7,958 | 5,684 | data-driven settings schema, ~1/3 |
| Usage | 6,788 | 2,320 | port |
| Hosts | 6,606 | 3,077 | port |
| Changes | 6,483 | 2,252 | port |
| Demo | 4,166 | 2,026 | replaced by FakeTransport |
| Notifications | 3,891 | 60 | port core; platform handlers new |
| AgenticoOverlay pkg + Overlay/ + Settings overlay + Hosts/OverlayPeer* | 3,874 + 2,499 + ~1.0k | | **DROP** |
| Browser (Ports/preview) | 2,626 | 570 | port |
| Files | 2,106 | 336 | port |
| DesignSystem | 1,830 | 233 | rebuild as RN components (section 3) |
| Skills / Snippets / Attachments / Images | 1,429 / 487 / 755 / 391 | | port |
| Pairing | 1,416 | 349 | port |
| LiveActivities / Intents / Watch app | 1,430 / 437 / 364 | | Phase 6, native Swift reused |
| Extensions: Widgets 3,316, ActivityCore 699, NotificationCore 842, UsageCore 473, Watch 595+667+206, NotificationService 29 | ~6.8k | | reuse Swift as native targets (Phase 6) |
| Security | 735 | 65 | replace with libs |
Rough ratio guess (unmeasured): logic 0.4-0.5x, views 0.5-0.6x => 150k Swift ~ 55-65k TS before dropping Demo/Overlay/Markdown;
target 40-50k after the reductions in section 3. Treat as a planning number only.

---------------------------------------------------------------------------------------------------------------------
## 2. Phased backlog

Verification kinds: **U** = vitest on `packages/core` (fixtures/vectors/goldens), **I** = integration against
`scripts/isolated-herdr-backend.py` (real sshd + herdr, both simulators), **M** = Maestro flow against `FakeTransport`
(deterministic) or a real isolated host, **S** = structural screenshot check (elements/states/copy from screens.yml `states:`,
not pixels). Feature ids are `<file>#<slug>` from screens.yml; screens abbreviated by area prefix.

### Phase 1: Hosts + pairing + SSH transport
| # | Item | Features / screens | Behavior | Acceptance (agent-verifiable) |
|---|---|---|---|---|
| 1.1 | **Spike S1 SSH module (gate)** | connectivity#agenticossh-package-libssh2-openssl, #transport-protocol-and-eventssession | connect, ed25519 auth, host-key callback, exec, streamlocal request/response, PTY, SFTP range read, direct-tcpip | I: script connects to isolated herdr on iOS sim AND Android emulator, `ping` returns protocol >= 17, `session.snapshot` parses, 1 MiB response ok, forwarding-refused sshd gives `streamLocalOpenFailed`. Decision doc picks Android option (a/b/c from section 0.1) |
| 1.2 | Wire types + HerdrWire/Events | non_ui transport | generated TS types, envelope, event stream | U: schema regeneration idempotent (`--check`); decode of every `result` tag in RESULT_TAGS from captured JSON; unknown enum values survive round trip |
| 1.3 | Host model/store, credentials, host-key TOFU | hosts.list, hosts.form, hosts.remove-confirm, hosts.trust-alert, hosts.replace-key-alert, hosts.replace-auth-key-confirm; connectivity#adding-a-host..., #changed-host-key... | add/edit/remove Host (manual), Device Key in secure-store, "Trust this Host?" with 60 s timeout, changed-key flow | U: HostDraft validation, fingerprint format, mayNameAnotherMachine table; M: add host manually -> trust alert -> saved; changed key shows replace alert |
| 1.4 | Pairing | hosts.pairing-scanner, hosts.pairing-ceremony; connectivity#pairing-qr-pairing-code, #herdr-endpoint-pairing-code-v2... | scan QR / paste `HERDR-PAIR:` code, per-address 4 s race, bootstrap auth, enroll, verify with Device Key, then persist | U: decode both vector files (accept/reject cases, `unsupported_version`); ceremony state machine with scripted connector (failure copy per `PairingStep`, nothing persisted on failure, retry drops bootstrap after `verificationFailed`); I: real plugin `pair-accept.js` as forced command (as `PairingCeremonyE2ETests`); M: paste code flow |
| 1.5 | Host detail + preflight + routes | hosts.detail, hosts.route-page, hosts.new-route, hosts.select-session-alert, hosts.setup-guide, hosts.plugin-notice; connectivity#routes-and-route-racing, #installing-and-updating-the-plugin... | checklist (SSH, env, herdr installed, server running, protocol), routes with "In Use", plugin status notice | U: RouteRace (stagger, discard late winners), preflight failure mapping, plugin notice matrix vs `plugin-version-v1.json`; I: preflight green on isolated herdr; S: hosts.detail |
| 1.6 | EventsSession + connection status | non_ui connectivity..., console#foreground-background-and-connection-lifecycle; console.host-connection-sheet, console.host-issues-sheet, console.host-issue-rows | reconnect/backoff/keepalive, AppState grace period (15 s) suspend/resume, Retry/Stop Connecting | U with fake clock: backoff 1,2,4..30 s, non-retryable stops, pane subs dropped on reconnect, overflow -> `eventsDropped`; I: kill sshd -> reconnecting -> recovers |
Dropped/deferred in phase: **Jump Host** (hosts.form fields, `connectThrough`): defer until S1 shows the lib supports nested direct-tcpip; **Overlay** (settings.overlay-* x10, hosts.peer-picker): dropped by decision; **RSA keys**, **native Windows** (hosts.list branch): deferred; `hosts.list` iPad sheet form: single stack screen.

### Phase 2: Agents / Inbox / Chat / approvals
| # | Item | Features / screens | Behavior | Acceptance |
|---|---|---|---|---|
| 2.1 | Console projection | console#snapshot-and-delta-convergence..., #console-ordering-and-pins, #agent-status | snapshot+delta, ordering, pins | U: port `ConsoleStoreTests`/`HostConsoleProjection` cases; stale-snapshot-never-overwrites-newer-event test; ordering comparator vs fixtures |
| 2.2 | Home + Status Inbox | shell.home, shell.home-new-menu, console.no-hosts-empty, console.empty-states-agents, console.host-connection-sheet; console#home-launcher-iphone | inbox (Needs you, Working, Done, idle), sessions, host cards, usage ring placeholder | U: `StatusInboxProjector`/card presentation; M: FakeTransport with Blocked+Working+Done agents shows the three groups, tap opens detail; S: shell.home |
| 2.3 | Agents list + rows + actions | console.agents-list-flat/by-host/by-workspace/by-status, console.agent-row, console.row-context-menu, console.close-confirmation, console.host-filter-menu, console.presentation-menu, console.search, console.quick-detail-sheet, console.rename-sheet; console#agent-list-presentation..., #agent-row-actions..., #agent-row-layout... (basic fields) | four presentations, host filter, search, pin/close/rename | U: filter/search/grouping; M: pin moves row first, close confirm calls `pane.close`, rename |
| 2.4 | New Agent / workspaces / worktrees | console.start-agent, console.workspace-picker, console.directory-browser, console.worktree-details, console.worktree-remove-confirm, console.worktree-removed, console.missing-agent; console#new-agent, #remote-directory-browser, #worktrees... | start agent in dir / new worktree / new workspace; directory browser (exec `ls`-style script) | U: launch request building, directory script output parser, recent dirs; I: start agent on isolated herdr appears in snapshot |
| 2.5 | Agent detail shell | agent-detail.container, .header, .header-more-menu, .alerts, .agent-switcher, .close-confirm; console#agent-detail-navigation..., #agent-focus-mark-done-as-seen | header (program mark, model, context), switcher, surface toggle (Chat/Terminal), focus marks Done as seen | M: open agent -> header shows program/status; toggle persists; focus RPC sent for Done |
| 2.6 | Chat transcript engine: **Claude + Codex first** | agent-detail.chat, .chat-placeholders, .chat-banners, .chat-timeline; chat#transcript..., #live-updates..., #earlier-history..., #chat-shows-another-or-earlier-conversation..., #chat-cache-and-offline-entry-points | locate, tail, follow, reduce, project, cache, drift detection | U: every fixture in `ChatFixtures/claude`, `/codex` against Swift goldens (or hand assertions ported from `ClaudeTranscriptReducerTests`, `ClaudeChainResolverTests`, `CodexIncrementalTests`, `CodexLegacyReplayTests`, `CodexLineageTests`, `TranscriptFollowerTests`, `ChatLineFramerTests`); locator cases (project-key NFC/200-unit hash, UTC day +-1); path-safety tests |
| 2.7 | Chat UI | agent-detail.chat-timeline, .chat-floating-controls, .subagent-transcript, .chat-image-preview, .chat-file-diff-sheet; chat#timeline-markdown-and-tool-rows, #message-jump | rows, tool rows, markdown, fold finished turns, jump to latest, subagent read-only | M: fixture-backed FakeTransport renders N rows, tool row expands, load-earlier appends; S: agent-detail.chat-timeline |
| 2.8 | Composer + send + Stop | agent-detail.composer, .composer-add-menu, .composer-more-menu, .composer-skill-suggestions, .chat-command-suggestions; terminal-and-input#composer, #composer-stop-and-folded-composer, chat#replying-from-the-composer-send, #stop | local draft, one `agent.prompt` on send, `agent_blocked` refusal, send witness | U: `AgentComposerStore`/`ComposerDeliveryPolicy`/`ChatSendWitness` cases; M: type -> send -> optimistic row -> witness confirms |
| 2.9 | **Blocked card + approvals (in-app)** | agent-detail.chat-blocked-card, .chat-tools-keyboard; chat#blocked-card-answering..., #tools-dock-and-agent-keys | parse screen, buttons, question forms, send verified keys | U: all `ChatFixtures/screens/*` through parsers/planners (Claude, Codex first), fingerprint/grace/unconfirmed tests as in `BlockedCardStoreTests`/`DialogActionPlannerTests`; I: approve a real Claude prompt on isolated host; **never resend** test |
| 2.10 | Chat for Pi/OMP, Grok, OpenCode + their dialogs | same screens | adapters + parsers | U: remaining fixtures; OpenCode I (needs sqlite on host) |
| 2.11 | Background Work | agent-detail.chat-background-strip, .chat-background-sheet; chat#background-work | Claude subagents/workflows strip | U: `ChatBackgroundWorkTests` cases (2 h/3 h staleness) |
Deferred: iPad sidebar family (shell.ipad-sidebar, .list-switcher, .wide-iphone-footer, console.empty-detail, split view); shell.commands (hardware shortcuts); agent-detail.edge-back-gesture (use navigator default); Agent List Fields editor (settings.agent-list-fields*, Phase 4); Codex shared-server notice (`chat#codex-shared-server-no-daemon-notice`) with 2.6.

### Phase 3: Terminal
| # | Item | Features / screens | Behavior | Acceptance |
|---|---|---|---|---|
| 3.0 | **Spike S2 terminal renderer (gate)** | terminal-and-input#attach-live-agent-terminal, #touch-scrolling... | WebView + xterm.js (or ghostty-web WASM, (unverified)) fed by PTY bytes | I: attach to a real `claude`/`codex` TUI; check: colors, alt-screen, wheel->semantic scroll when alt-screen requests it, resize round trip, IME, 60 s of `yes` output without dropping frames; Kitty keyboard protocol support (Ghostty encodes enhanced keys per ADR 0004; xterm.js does not, (unverified)); document gaps |
| 3.1 | Attach pipeline | agent-detail.terminal, .terminal-status-overlay, .live-in-another-window; terminal#attach...; ADR 0013/0016/0017 | PTY exec `herdr agent attach`, display-only, takeover, reattach <= 2, foreground replace | U: `AttachTerminalStore` state machine incl. `terminalChannelAlreadyOpen` (loser must not end), startup-probe filter; I: attach, resize, kill link -> "Reconnecting…" -> back |
| 3.2 | Toolbars, keyboards, Direct Input | agent-detail.tools-keyboard, .control-keys, .terminal-keyboard, .terminal-toolbar, .terminal-toolbar-dpad, .terminal-toolbar-more-menu, .direct-input, .direct-input-more-menu, .shell-keys-dock; #tools-keyboard..., #direct-input | Esc/Tab/arrows/Sticky Ctrl, system keyboard into PTY | U: key encoding table (incl. sticky ctrl); M: tap key row sends expected bytes (spy on fake PTY) |
| 3.3 | Selection, links, jump, review paste | .select-text-sheet, .attach-links, .link-open-failed-alert, .message-jump, .review-paste-sheet; #long-press-text-selection, #attach-links..., #message-jump, #reviewed-paste | | U: `AttachLinkIndex` (478), `AttachUserMessageIndex` cases; M: paste with newline opens review |
| 3.4 | Snippets, Skills, Attachments | .snippets-pane, .snippets-manager, .snippet-editor, .skills-pane, .skills-picker, .skill-content, .photo-file-picker, .staging-status-bar; #snippets, #agent-skills..., #attachments... | insert-without-submitting (ADR 0009), stage image/file over SFTP (ADR 0006) | U: snippet store, skill listing parse; I: upload image -> path inserted, file exists on host |
| 3.5 | Shell + workspace terminals | console.terminals-list, console.new-terminal, agent-detail.shell-terminal, .shell-close-confirm, .session-drawer, .open-terminal-chooser; #shell-terminal, #workspace-terminals..., ADR 0015/0017 | create shell tab, retention pool of 5, takeover | U: `TerminalConnectionPool`/`RetentionBudget`; I: shell opens in agent dir |
| 3.6 | Appearance pane | .terminal-appearance-pane | font/size/theme | M: change size persists |
Dropped: libghostty rendering, Hangul input special-case (`HangulInput` 263: re-evaluate after S2), UIKit gesture layers, iOS-26 dictation (system keyboard mic covers it), `agent-detail.edge-back-gesture`. Native Windows terminals deferred.

### Phase 4: Usage / Files / Ports / Changes / Settings
| # | Item | Features / screens | Acceptance |
|---|---|---|---|
| 4.1 | Usage | usage.tab, .quick-sheet, .scope-menu, .limits-page, .limits-sheet, .day-sheet, .breakdown-list, .host-section, .accounts-sheet, .account-rename-alert, .account-remove-confirm, .account-failure-alert, .accounts-notice; notifications#usage..., #claude-code-accounts-usage | U: parse `usage-v1.json`; scope sum + hosts-left-out; pace/80-95 levels; accounts file validation; probe truncation never reads as success; I: real plugin `usage-query.js`; M: ring opens quick sheet. Wide layouts (usage.ipad-split, .wide-layout) deferred |
| 4.2 | Files | files.browser, .download-confirm, .upload-pickers, .upload-collision, .rename-alert, .delete-confirm, .quick-look, .share-sheet, .save-to-files; browser-and-files#file-browser..., #downloads..., #uploads... | U: listing/ignored-names/protected-paths; I: download, upload with collision, rename, delete on isolated host. Quick Look -> expo-sharing/system viewer; Save to Files -> Share/SAF. Native Windows hidden |
| 4.3 | Ports + preview | browser.ports, .open-port, .preview, .leave-confirm; #ports-and-the-browser-preview | U: `ListeningPortProbe` parse, `PortPreviewNavigation.decide`; I: open port tunnel, WebView loads `http://127.0.0.1:<p>/`; needs Android cleartext-to-localhost config + iOS local-networking ATS; background grace 15 s stops tunnel |
| 4.4 | Changes | changes.list, changes.file-diff; changes-settings#checkout-changes..., #file-diff..., #untracked-directories, #path-and-line-references..., #row-changes-totals... | U: port `GitProbe*`/`CheckoutChanges` tests (1.6k lines of tests) on captured git outputs; M: diff unified/side-by-side toggle |
| 4.5 | Settings | settings.root, .theme, .appearance, .terminal-theme-picker, .chat, .chat-cache, .chat-cache-clear-confirm, .input-toolbar, .agent-list-fields(+host, add-field, reset/sync confirms), .acknowledgements, .license-notice, .usage, shell.app-lock; changes-settings#appearance..., #agent-list-fields-..., #acknowledgements... | one declarative schema renders all settings; M: theme switch Indigo/Papel applies; app lock cover on background (expo-local-authentication) |
| 4.6 | Deep links | shell.window-root; console#deep-links-and-notification-routing | U: parse `agentico://agent/<hostUUID>[/<paneID>]` and `?host=&session=&pane=` |
Dropped: settings.overlay-* (10 screens), iPad windows/scene restoration (`console#windows-and-scene-restoration-ipad-multi-window`, `changes-settings#windows-and-ipad`), ack: licences UI rebuilt from `Notices/inventory.json`.
Dropped (Enzo, 2026-11-05): the extra Swift app themes `settings.theme--catppuccin-mocha`, `--gruvbox-dark`, `--nord`:
the app keeps Índigo (default), Papel and Noche; those palettes exist only as terminal palettes (the terminal theme
registry in `packages/ui/tokens/terminal-themes`).

### Phase 5: Notifications
| # | Item | Features / screens | Acceptance |
|---|---|---|---|
| 5.1 | In-app banner (no push needed) | shell.notification-banner; notifications#agent-notification | U: gates mirror plugin (hold-before-announce, same-status dedupe, suppress when on that agent); M |
| 5.2 | Registration | settings.notifications, .notification-explainer, .notification-privacy; notifications#notification-registration, #notification-key | U: `notifications.json` v1 read/modify/atomic-write incl. unknown-field preservation, one entry per token+session; vector `notification-session-v1.json` |
| 5.3 | Android push (FCM) + decrypt | same | U: decrypt `notification-payload-v1.json` vectors; I: relay stub -> FCM data message -> headless decrypt -> local notification with title/body; tap routes to agent. Needs relay+plugin changes (section 4) |
| 5.4 | iOS push (APNs) | same | needs paid team; Notification Service Extension reuses `AgenticoNotificationService`+`NotificationCore` Swift (Phase 6 target work) |
| 5.5 | Approve/Deny from notification | notifications#approve-from-notifications-f5-r1-r4 | U: runner checks (TTL 30 min, opt-in, `offersApprove`, ledger once, Host-side apply script) using `approval-preview-v1.json`; Android notification actions run headless SSH; unlock gate for Approve. Defer to last |
Deferred: Watch/Live Activity approvals (Phase 6).

### Phase 6: Live Activities / widgets / Watch / Siri (native Swift inside Expo, iOS only)
- Reuse as targets: `AgenticoWidgets` (3.3k), `AgenticoActivityCore`, `AgenticoUsageCore`, `AgenticoWatch*` (1.5k), `AgenticoNotificationService`.
- Needs a small native module to write the App Group snapshot (UsageWidgetSnapshot, ApprovalOptIn) and start/update Live Activities (`HostLiveActivityCoordinator` 687 logic is portable to TS; ActivityKit calls stay native). Features: widgets.usage-widget, .usage-limits-widget, .live-activity-lock-screen, .live-activity-island; notifications#live-activity-per-host, #widgets..., #background-refresh-usage-widgets, #approve-from-the-live-activity...; Watch (specs/f7-apple-watch.md); Intents (`Intents/` 437).
- Acceptance: U: `live-activity-content-v1.json` through the TS builder; M/manual on device (Live Activity cannot run in simulators with push). Android equivalents (ongoing notification, home-screen widget) not planned.

---------------------------------------------------------------------------------------------------------------------
## 3. Minimal shared component list (24)

Derived from `DesignSystem/Components` (12 files: AgentProgramMark, CapsuleBadge, CopyableValueRow, CopyButton,
DisclosureChevron, EmptyState, MetadataChip, ScreenBackground, SectionHeader, StatusDot, StatusPill, ThemedCard) and
screens.yml presentation counts: 42 inline, 38 sheet, 26 push, 17 confirmationDialog + 11 alert, 13 menu + 3 popover,
11 overlay, 5 tab. Rule: every confirmation is one imperative `confirm()`, every menu one `ActionMenu`, every sheet one `Sheet`
(collapses 28 + 16 + 38 screens into 3 primitives).

1. `ThemeProvider` / `useTheme` (tokens: colors incl. status(), spacing x1.3, radius 8, hairline 16%; themes Indigo, Papel, Noche optional; replaces `AgenticoTheme`+`ThemeStore`)
2. `Screen` (background, safe area, readable column, scroll/refresh) = ScreenBackground + ReadableColumn
3. `Card` (ThemedCard)
4. `ListRow` (leading slot, title/subtitle, trailing, chevron, swipe actions, long-press menu) used by Agents, Hosts, Files, Changes, Settings, Ports
5. `Section` (SectionHeader + grouped container + footer text)
6. `StatusDot`
7. `StatusPill` / `Badge` (CapsuleBadge; counts pills)
8. `Chip` (+ wrapping `ChipRow`) = MetadataChip, ChipWrap
9. `ProgramMark` (logo + status dot cut into corner; Lobe icons as SVG; neutral glyph fallback; AgentProgramMark+Identity)
10. `EmptyState` / `Skeleton` / `ErrorState` (TransportError.presentation: summary, detail, recovery)
11. `Sheet` (detents; bottom-sheet or native formSheet)
12. `confirm()` + `AlertHost` (alert / confirmationDialog / destructive)
13. `ActionMenu` (context menu, popover, header "more"; native menus preferred)
14. `Button` (primary, secondary, destructive, text, icon-only, capsule) + `CopyButton`/`CopyableValueRow`
15. `Form` rows: `TextField`, `ToggleRow`, `PickerRow`, `StepperRow`, `NavRow` (drives the settings schema renderer)
16. `Banner` (inline notice with action: chat banners, plugin notice, host issues, accounts notice, drift)
17. `InAppBanner` / `Toast` (notification banner overlay)
18. `Meter` (usage limit bar with pace tick, 80/95 colors) and `BarChart` (daily tokens/cost; SVG or victory-native)
19. `VirtualList` (FlashList wrapper; inverted mode for Chat; section headers)
20. `Markdown` (library renderer + `CodeBlock`)
21. `DiffView` (unified/side-by-side; used by Changes, chat file diff, tool rows)
22. `TerminalView` (WebView bridge: write bytes, resize, input callbacks, selection; one component for Agent attach and shell)
23. `KeyRow` / `KeyboardDock` (toolbar, tools keyboard, control keys, Sticky Ctrl) driven by data (key tables)
24. `Composer` (multiline draft, add menu, send/stop, suggestions strip); plus `QRScanner` (expo-camera) used once

Libraries to prefer over code: expo-router (nav), zustand + MMKV (state/persist), @tanstack/query (one-shot reads: usage,
files, changes, ports), FlashList, react-native-markdown/remark, expo-secure-store, expo-camera, expo-local-authentication,
expo-document-picker/image-picker/sharing, @noble/curves + ciphers + hashes, zod only at wire edges. Hosts persistence,
Chat cache, Demo mode, Markdown renderer and the overlay stack are where Swift lines disappear.

---------------------------------------------------------------------------------------------------------------------
## 4. Server-side changes RN needs

Plugin and relay are JS and stay in the new monorepo (move them in, keep `plugin/test-vectors` single-sourced so TS app
tests and plugin tests read the same files). Protocol items that need NO change: pairing code v1/v2, `HERDR-ENROLL`,
bootstrap marker, forced-command enrollment, notification envelope (AES-256-GCM, AAD `HERDR-NOTIFY:1`), approval preview and
Host-side apply, usage, sidebar snapshot, session-scoped registration. They assume nothing about iOS except push.

Needed for Android push (Phase 5):
1. **Relay** (`relay/src/worker.js`): `TOKEN_PATTERN = /^[0-9a-f]{16,200}$/` rejects FCM tokens (contain `:`, `-`, `_`). Add a `platform`
   field (`"ios"` default, `"android"`) selecting an FCM HTTP v1 path (OAuth2 service-account JWT -> access token, cache like
   `apns-jwt.js`; `POST https://fcm.googleapis.com/v1/projects/<id>/messages:send`; data-only message, `android.priority: high`,
   `android.collapse_key` replacing `apns-collapse-id`, 4 KB data cap equals today's cap). New env/secrets: `FCM_PROJECT_ID`,
   service-account JSON. Relay stays a dumb pipe; envelope forwarded verbatim; map FCM `UNREGISTERED`/404 to the 410 verdict so pruning works.
2. **Plugin** (`notify-hook.js`, `activity-hook.js`, `notification-config.js`): registration entries gain optional
   `platform`; hook passes it to `/push` (`APNS_ENVIRONMENTS` check currently skips any entry whose `env` is not
   production/sandbox: Android entries must be accepted with `env: "fcm"` or a platform-aware check). Additive v1
   (readers ignore unknown fields); bump plugin version and add an `AgenticoPluginFeature` gate. An old plugin would send
   Android tokens to the APNs path and get `bad_token` 400 (final, harmless but silent), so the app must disable the toggle
   on old plugins. `live_activity` field stays iOS-only.
3. **Relay hosting**: the default `http://127.0.0.1:8787` relay needs the missing Node HTTP wrapper (fork.md); Android additionally needs a
   Firebase project and `google-services.json` in the build. Firebase sees token + ciphertext + collapse key (same trust story as APNs; update `PRIVACY.md`).
4. **iOS** push stays blocked on a paid Apple team (`aps-environment`), unchanged from today.
5. Docs/versions: relay README table, plugin README registration table (`platform`, `env`), `docs/agents/live-activity-contract.md` unchanged.

Other host-visible facts for Android users (no code change): Tailscale VPN app users hit the same Tailscale-SSH-on-port-22
rejection in pairing; `AllowStreamLocalForwarding` and `AllowTcpForwarding` requirements identical; plugin install
step (`herdr plugin install <owner>/agentico-app --ref plugin`) still depends on the GitHub repo existing.

---------------------------------------------------------------------------------------------------------------------
## 5. Dropped / deferred ledger (with reason)

| Item | Screens / features | Reason |
|---|---|---|
| Overlay Networks | settings.overlay-* (10), hosts.peer-picker, Overlay/ 2.5k, AgenticoOverlay 3.9k, `hosts` overlay fields | Decision 2026-11-01: use Tailscale/ZeroTier VPN apps |
| libghostty | ADR 0004 | iOS-only; replaced by WebView renderer (spike S2) |
| iPad/tablet layouts | shell.ipad-sidebar, .list-switcher, .wide-iphone-footer, console.empty-detail, usage.ipad-split, usage.wide-layout, shell.commands | Defer; phone parity first; responsive pass after Phase 4 |
| Multi-window/scene restoration | console#windows-and-scene-restoration..., changes-settings#windows-and-ipad | iPadOS-only |
| iOS 26 dictation | ADR 0003/0031, Console/Dictation 741 | OS keyboard dictation covers it |
| Jump Host | connectivity#jump-host | After S1 proves nested direct-tcpip |
| RSA keys | ADR 0019 | ed25519 + password first |
| Native Windows hosts | ADR 0018 | After Phase 4; same exec primitives |
| Live Activities, widgets, Watch, Siri | widgets.*, Phase 6 | iOS-native targets |
| Edge-back gesture, interactive pop | agent-detail.edge-back-gesture | navigator default |
| Demo/screenshot launch-arg mode | console#demo-and-screenshot-mode | replaced by FakeTransport |
| Plugin install from app | hosts.plugin-notice action | port UI; install path broken until repo exists |
