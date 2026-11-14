# To do

The working list. One line per item; tick it in the commit that closes it, and move what is done to
[roadmap.md](roadmap.md) when a group empties. "Done when" is the check that closes the item.
Items are worked from the top of each group; groups are in priority order.

## 1. In flight

- [x] **Simulator suite on the new native build, then push.** The icon and the black native splash changed
  native inputs. Done when: every `pnpm sim:verify` flow passes on a rebuilt Debug app and main is pushed.
- [x] **Agent lab, OpenCode on the simulator** (`scripts/agent-lab.py`, `docs/e2e-live-backend.md`). Done
  when: Maestro flows under `e2e/` drive the app against a real OpenCode (Home, Chat, send, Reject, a
  question, modes, shortcuts) and their screenshots are in `design/atlas/sim/live-*`.
- [x] **Agent lab, Codex.** The login inside the lab is done by a person or the lead, never by a worker. Done
  when: Codex has the same captures, fixtures and flows as OpenCode. (Codex 0.167: `goldens/codex/lab`,
  `e2e/live` with `live-codex-*` screenshots; three findings in group 3.)
- [x] **Agent lab, Approve.** The flow asserts the exact harmless command and the throwaway repository
  before it taps the single-use approve option, and fails without tapping otherwise. Done when: the lead
  has read the flow and it passes for OpenCode and Codex. (Passed for both on 2026-11-13: the repository held
  only the one new empty file each time.)
- [x] **Device install.** Done when: the build with everything below is on the test iPhone.

## 2. Chat reads lighter (every program)

From comparing Chat with a first-party client on the same conversation. All of it works on Chat's own model,
so no program-specific branches.

- [x] **Tool calls as one quiet line.** Consecutive tool calls fold into a single borderless row ("Ran 3
  commands", "Read 4 files") that opens on tap; a card only when something needs attention (a failure, an
  approval, a diff). Done when: a turn with five tool calls takes one row, and the atlas shows it.
- [x] **The command's description, not its text.** When the program records what a command is for, the row
  shows that; the raw command shows on opening it. Done when: a long shell line no longer fills a row.
- [x] **One status line above the Composer.** Elapsed time, what the Agent is doing, and how much Background
  Work runs, as one line; finished work folds into it. The "Working for" row leaves the transcript. Done
  when: the line is the only live indicator and opens the Background Work sheet.
- [x] **Harness notices out of the conversation.** Records such as "Background command completed" are not
  messages. Done when: they show in the Background Work sheet and not as Chat rows.
- [x] **The Composer says what Send does.** While the Agent works and the program queues input, the
  placeholder says the message is queued for after this turn. A property of the program's send policy.
- [x] **Conversation title in the header**, with the program and Host under it; the mode chip moves next to
  the Composer.
- [x] **Dictation in reach.** The microphone shows in the Composer when the draft is empty.
- [x] **Message actions in sight.** Copy (and read aloud where the platform gives it) under the latest
  answer, not only on long press.

## 3. Found and not fixed

- [x] **Add Manually: "Trust this Host?" does not show on the first connection.** Found by the agent lab:
  after Save the Host's sheet says Connecting while SSH waits for the host-key answer, and the alert is
  not visible; later redials do not ask again. Blocks the lab's simulator flows and any user who adds a
  Host by hand. Done when: the prompt shows over whatever is on screen, and a redial asks again.
- [x] **Demo: the Codex Agent's Chat says "Conversation Not Readable".** It is what a store reviewer sees.
  Done when: every demo Agent opens a conversation, or says in plain words why it has none.
- [x] **An Agent screen whose Host was removed shows "Reconnecting…" forever.** Done when: it says the Host
  is gone and offers the way back.
- [x] **Terminal config files pile up in the app's temporary folder** (`ghostty-config-*.conf`, one per
  terminal opened). Written by the terminal library's native controller, which removes its file only
  when it is deallocated: it is not being released, or the app is killed first. Needs a native patch
  (sweep at start, and find why the controller outlives its view). Done when: each is removed with its
  terminal, and a start clears leftovers. Closed by `patches/expo-libghostty@0.8.1.patch`: the file goes right after
  ghostty loads it (the shared controller is never deallocated, so one stayed per process), and a start
  sweeps leftovers; proven on the simulator.
- [x] **Codex 0.167: herdr's hook is untrusted, and Chat says to send a prompt.** Found by the agent lab:
  Codex holds a new pane on "Hooks need review" until the user trusts herdr's SessionStart hook (`/hooks`,
  or "Trust all" on that screen). Until then herdr reports no session, and Chat keeps saying "Codex reports
  its conversation after a prompt" after every prompt (`goldens/codex/lab/no-session-without-hooks.ansi`).
  Done when: Chat, and the Setup Guide for Codex, say to trust herdr's hook in Codex.
- [x] **Codex 0.167: a command waiting for approval, or declined, has no row in Chat.** Found by the agent
  lab: Codex runs commands through code mode (`custom_tool_call` `exec` calling `tools.exec_command`); the
  reducer reads that call only for a patch. Done when: the skipped test in `chat/codex/lab.test.ts` passes.
- [x] **Codex: the mode chip says Default Mode while a Plan Mode question covers the footer.** Found by the
  agent lab. Done when: the skipped test in `blocked/codex-lab.test.ts` passes (keep the last mode read).
- [x] **OpenCode Go usage is a stub.** Closed by not listing it: limits live only in the web console (cookie session), no CLI, file or API a Host script can read.
- [x] **Connection sheet: the failure text touches the pinned actions** on a fit-height sheet.
- [x] **Demo Home: every Session thumbnail shows the same screen.**
- [x] **OpenCode: a background subagent's permission can look like the main session's.** Reject then opens
  OpenCode's follow-up field; not destructive. Done when: the end of a background subagent is known.
  Known from the parent's rows (the `subagent` call's `metadata.status: running`, ended by the
  `synthetic` row naming its `childID`), on constructed rows; a lab capture of one would prove it
  live. A launch above every loaded read, or a prompt the user types into the child, stays unseen.
- [x] **Claude Code `/context` from Chat.** Runs in the terminal today because Chat's echo of local command
  output is unverified. Done when: verified and moved to the conversation, or the reason is recorded.
  Verified (Claude Code 2.1, pasted as Chat sends it, while idle): it records the command, its output and
  the output as markdown, and leaves the input box empty. Chat sends it while the Agent is idle and shows
  the markdown as the command's notice. Mid-turn stays held (unverified there).
- [x] **tmux Hosts type a prompt's line breaks as Enter.** Matters when tmux Hosts ship; a draft with
  several diff comments would go out in pieces.

## 4. Release 1.0.1

- [x] **Store screenshots again**, after group 2 changes how Chat looks. (Retaken 2026-11-13 into
  `docs/store/screenshots/en`; they go up with the 1.0.1 version in App Store Connect.)
- [x] **Spanish listing** in the store, from `docs/store/listing.md`. (Spanish (Mexico) added to the 1.0.1
  draft on 2026-11-13 with the new English text and screenshots; it goes public when 1.0.1 is released.)
- [x] **Build and upload** with the new icon, the animated launch and everything above, to internal testers.
  Submitting for review stays a person's step. (1.0.1 build 3 uploaded 2026-11-13, tag `ios-1.0.1-3`; the owner
  answered export compliance and TestFlight shows it for the Internal group. Version 1.0 went live the
  same day.)

## 4b. After 1.0.1 (2026-11-14)

- [x] **One corner scale and screen edges.** `t.radius` with iOS continuous corners; top bars at the safe top,
  bottom bars 20 pt from the bottom (`useChromeInsets`).
- [x] **Home's top bar without the Agents and Sessions buttons**; both are in the Host pill's menu.
- [x] **The Host pill's menu covered the pill on Home.** Measured on the simulator: iOS draws a stack screen
  72 pt down while Fabric measures it from 0, so every anchor frame was 72 pt high. Anchors are corrected by
  the screen's real origin (`windowFrame.ts`), and an open menu measures again when the keyboard moves.
- [x] **Air at the end of the Chat** above the status line, the Blocked card and the Composer.
- [x] **Notifications asked after the first Host**, with a sheet that says why (`PermissionPrimer`). Approve
  from Notifications stays off by default (owner, 2026-11-14). Not yet seen on a real phone.
- [ ] **Over-the-air JS updates** (ADR 0028, accepted by the owner 2026-11-14). Built and proven locally on a
  Release simulator build with a throwaway key (`docs/guides/updates.md`): the update server, the publish
  script, the app side behind the official-build flag, Early Updates. Left, in order: the signing key and
  certificate (the owner keeps the key), the Cloudflare bucket, Worker and domain, the real R2 upload in
  `publish/upload.js`, the privacy policy and store wording, the first store release that contains it, the
  first update to beta. Small: the Update row in Settings cuts its date ("d9b48f5c (20…").

## 5. Needs the owner

- [ ] **On a real phone:** Ask Agent and Comment on Line against a real Agent; an unreachable Host's sheet
  and Agent screen; a resumed subagent listed as running; approvals in Claude Code still confirm (the
  matched-request change); a command shortcut from Chat opens the terminal with the command typed; the
  animated launch on a Release build, with Reduce Motion and with App Lock. The notification sheet
  after pairing a first Host, the system prompt after it, and a push arriving without visiting Settings.
- [ ] **What a simulator cannot do:** a push with the app closed, Approve from a notification, the Live
  Activity, for Codex and OpenCode (`docs/guides/device-test-codex-opencode.md`).
- [ ] **Local `worktree-agent-*` branches.** Their work is on main by cherry-pick, so git only deletes them
  by force.

## 6. Later (each needs a decision record first)

- [ ] **Host addresses that heal themselves.** Each encrypted notification carries the Host's current
  addresses and the app updates that Host's routes; the pinned host key still decides which machine is
  trusted. Changes the notification envelope.
- [ ] **iPad.**
- [ ] **Approve without opening the app, and Apple Watch.**
- [ ] **A bug hunt by zones** (planned, never run).
- [ ] **State docs.** Archive `docs/tasks.yml` and `docs/PROGRESS.md`, bring CLAUDE.md's gate notes up to
  date, add a map of `packages/core`.
- [ ] **Site:** remove the Windows installer while Windows Hosts are out of scope.
