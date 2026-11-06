# Rest of the roadmap: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:executing-plans. Run the tasks in order. Steps use checkbox syntax for tracking. This is a master plan over independent subsystems: each task fixes scope, files and proof; write the detailed test list when the task starts.

**Goal:** close the gaps against the Swift app, and give every Agent the same features on herdr and on tmux.

**Architecture:** programs plug in through `ProgramDefinition` (app) and `PROGRAMS` in `packages/plugin/src/install-program-hooks.js` (Host). Session backends answer the session protocol (ADR 0027). No UI branches per program.

**Tech stack:** Expo SDK 58, React Native 0.88, TypeScript, Node hooks, Vitest, `node --test`, Maestro through `pnpm sim:verify`.

**Spec:** `docs/swift-gap.md`, `docs/spec/parity.md`, `docs/decisions/0027-session-backends.md`, `../Agentico/docs/specs/f5-approvals.md`.

## Global constraints

- `CLAUDE.md` applies in full: reuse first, tokens, `t()`, files at 400 lines or fewer, screens at 150, no GPL code, no personal infrastructure in the repo.
- After each task: `pnpm verify-fast` green, commit, push. Never chain a commit after unverified tests. No force-push.
- A visual or navigation change runs `pnpm sim:verify` for its flows.
- A change in `packages/plugin` also refreshes the generated branch: `git subtree split --prefix=packages/plugin -b plugin`, then push it without force.
- Report coverage per Agent: say which Agents a change does not reach.
- Never restart, reconfigure or stop a service the owner runs. Test in the lab: user-level `sshd` on a high port, own config directories, scratch project.
- Approval tests use harmless commands in a scratch directory only.
- Never print secrets. Never delete data.
- A blocked task gets its reason next to its checkbox and the run moves on. It never stops the run, and it never gets a workaround that loosens a security check.

## Review focus

- A forged plain push carrying approval fields must act on nothing: the app trusts only the sealed envelope.
- The prompt changes between the notification and the tap: Approve sends no key.
- Two devices tap the same notification: one claim wins, the other is told.
- Face ID or a short trip to the background during a live shell: the session survives the 15 s grace, and a longer absence reconnects.
- A hook that fails must never break or delay the Agent it observes.

---

### Task 1: Quick fixes from the Swift gap

**Files:** the connection lifecycle in `apps/mobile/src/connections/`, the `appLockForKeys` setting and its SSH key reads, the Jump Host path behind `hostFeatureUnavailable`, a Board entry point. Tests beside each.

- [ ] Background grace: test first, states other than `active` keep connections for 15 s, Face ID included, and return inside the grace resumes without a reconnect.
- [ ] Key lock: test first, with the setting on, using a key needs the device's authentication, and a failed check connects to nothing.
- [ ] Jump Host: connect through it, proved in the lab with two user-level `sshd`. If `modules/ssh` needs a native change, move it to Task 10 and leave the form honest about it.
- [ ] Link Board from where a user would look for it.
- [ ] Commit and push each one apart.

### Task 2: Chat rows

**Files:** `apps/mobile/src/agent-detail/chat/`, `packages/core/src/chat/timeline`, `packages/ui/src/components`.

- [ ] Check whether tool output reaches the row, for each program.
- [ ] Tool output, diff, image preview and copy, one shared row model for every program. Compare with the approved crops.
- [ ] Commit, push.

### Task 3: Terminal gaps

**Files:** `apps/mobile/src/features/terminals/`, the terminal components in `packages/ui`.

- [ ] Wire Select Text, Attach Links and Message Jump, or remove them if unused by design.
- [ ] Pinch zoom keeps the grid; hardware keyboard ⌘ commands.
- [ ] Commit, push.

### Task 4: Agent coverage, and notifications for Pi, omp and Grok

**Files:** create `docs/guides/agent-coverage.md`; `packages/plugin/src/install-program-hooks.js` (`PROGRAMS`), `program-hook.js`, `program-hooks/`, `packages/plugin/test/program-hook.test.js`, plugin README table.

- [ ] One table: Claude, Codex, OpenCode, Hermes, Pi, omp, Grok by Chat, Send, Blocked card, Notification, Approve, on herdr and tmux. Each cell says proved on device, proved in lab, tests only or missing, with evidence.
- [ ] Find each program's hook or plugin mechanism in its own documentation. None: marked missing, with the reason.
- [ ] Test first: each event shape maps to Blocked or Done; install is idempotent and leaves the user's own hooks alone.
- [ ] One `PROGRAMS` entry each. Their binaries are not on the development Mac: install one in the lab if it needs no account, otherwise the cell stays "tests only".
- [ ] Commit, push, refresh `plugin`.

### Task 5: Approve on tmux

**Files:** `packages/plugin/src/approval-apply.js`, `approval-preview.js`, `program-hook.js`, `packages/session-bridge/src/main.ts`, `actions.ts`, tests beside each.

- [ ] Test first: `approval-apply` reads the pane and presses keys through a small backend interface, herdr and bridge being its implementations; the approval lines of the review focus are pinned on both.
- [ ] The bridge's `agent read` and `agent send-keys` answer what `approval-apply` calls.
- [ ] `program-hook.js` drops `approve: false` only for programs whose prompt `approval-preview` parses, and sends the sealed fields the herdr hook sends.
- [ ] Prove in the lab: real Claude Code in tmux, harmless command, apply run over SSH, the key lands once.
- [ ] Commit, push, refresh `plugin`.

### Task 6: OpenCode as a service, and Codex for real

**Files:** `packages/plugin/src/program-hooks/opencode-plugin.js`, `pane-records.js`, tests.

- [ ] Reproduce in the lab with a separate OpenCode config and port: a plugin in the service has no `TMUX_PANE`.
- [ ] Test first: the pane is resolved from the session's directory and the live pane list; an ambiguous match reports no pane, never the wrong one.
- [ ] Codex: one run in a scratch directory with the account's default model, changing no config. Rejected: record it and move on.
- [ ] Commit, push, refresh `plugin`.

### Task 7: Hermes compression rotation

**Files:** `packages/core/src/chat/hermes/`, tests.

- [ ] Test first, from a synthetic `state.db`: a compressed session shows its earlier segments in order, through older pages.
- [ ] A broken chain shows what exists and no error.
- [ ] Commit, push.

### Task 8: Why `sim:verify` fails bare on its first run

**Files:** `e2e/sim`, `scripts/`.

- [ ] Reproduce after a code change, find the cause with superpowers:systematic-debugging, fix it. No retry loop that hides it.
- [ ] Commit, push.

### Task 9: Component twins

**Files:** `packages/ui/src/components`, `docs/ux/components`.

- [ ] List the catalog components with two implementations and merge each into one, variants as props, compared with the approved crops.
- [ ] Commit, push, per component group.

### Task 10: Native batch

The owner asked for this work and acts as integrator's approval for native builds in this run.

**Files:** a native action handler next to the notification extension, `modules/ssh`, `packages/core/src/notifications/approval-action.ts`, composer tools, `app.json`, `packages/i18n/src/extras/{en,es}.json`.

- [ ] Approve and Deny without opening the app, and from the Live Activity. Design note first: how the action outlives the iOS completion handler and reaches the same gates. No safe way: stop, keep v1, which opens the app.
- [ ] Every gate of `approval-action.ts` holds on the native path, tested with shared vectors.
- [ ] Dictation and image annotation in the composer tools, for every program. Check the SDK 58 docs, `npx expo install`, MIT or Apache only, fakes first so both work in demo mode.
- [ ] Commit, push.

### Task 11: Milestone

- [ ] `pnpm test`.
- [ ] `npx expo prebuild --clean`, native rebuild, all `pnpm sim:verify` flows.
- [ ] Release build, installed on the iPhone if it is connected.
- [ ] Update `docs/roadmap.md`, `docs/swift-gap.md`, the coverage table. Write the owner's checklist below with exact steps. Commit, push.

---

## Needs the owner: not part of the run

**Decisions**

- Mosh: the reference implementation is GPL-3, which the repo rules forbid, and neither app ever had it. Options: skip it (shells reattach in under 2 s) or write the protocol from scratch, which is large.
- Hermes on a shared server: it runs under another user and herdr's socket is root's, so it reports no session. Sharing the socket would give that user root. A tmux bridge under that user avoids it, but changes a running server.
- iPad, Apple Watch, Shortcuts, Windows Hosts, Android push with the app closed: each is a product of its own.
- Accept ADR 0027.

**On the phone, after Task 11**

- Approve and Deny from a real notification, on herdr and on tmux.
- Hermes Chat against a real Host.
- Dictation and annotation by hand.

**Accounts**

- Rotate the OpenCode local service password.
- A Codex model the account accepts, if Task 6 was rejected.
