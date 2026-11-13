# Device test: Codex and OpenCode

A checklist for one person on a real iPhone, with a real Host. Today only Claude Code has been proven on a phone; for Codex
and OpenCode every capability is tested against fixtures only (see [agent-coverage.md](agent-coverage.md)). Running this
list is what turns "built" into "proven". Fill in the results table at the end, then update `agent-coverage.md` from it.

Rules for the run:

- Mark a step only after you saw it on the phone. A step that behaves differently is a fail, not "close enough".
- Where the code says a program does not support something, the step says **not expected**. Do not count it as a fail.
- Never approve a real command in a real project as a test. Every approval step below happens in the throwaway repository.
- One program at a time. Finish one section, then do the other.

## Setup

On your Host (the computer that runs herdr):

1. herdr installed and running, with the Agents Pocket plugin installed from the Setup Guide in the app. The phone is paired
   with the Host (Home shows it as connected).
2. The program under test installed and logged in: `codex` for section 1, `opencode` for section 2. Run each once by hand
   and send one prompt, so you know it is signed in and can answer.
3. A throwaway git repository that holds nothing you care about:

   ```sh
   mkdir -p ~/scratch-agent-test && cd ~/scratch-agent-test
   git init && echo "scratch" > README.md && git add . && git commit -m "scratch"
   ```

4. Make the program ask before it acts, so the approval steps are reachable:
   - Codex: start it with `codex --ask-for-approval untrusted` in the repository (check `codex --help` if your version
     names the flag differently). In this mode a command such as `touch` asks first.
   - OpenCode: create `~/scratch-agent-test/opencode.json` with
     `{ "permission": { "bash": "ask", "edit": "ask" } }` and start `opencode` in the repository.
5. Run the program inside herdr, in a pane whose directory is the throwaway repository. Note the pane id herdr shows for it;
   below it is written `<pane>`.
6. On the phone, in Settings > Notifications, turn notifications on for this Host, and allow them in iOS settings. The
   default push relay or your own are both fine; write down which one you used.

Capture kit, for any step that fails:

- A screenshot of the phone at the moment of the failure.
- The pane's screen as the Host sees it, taken on the Host while the problem is still on screen:

  ```sh
  herdr agent read <pane> --source visible --format ansi > ~/scratch-agent-test/capture-<step>.ansi
  ```

- The program's version (`codex --version`, `opencode --version`) and the app's version and build.

Safe requests used below:

- **Command request**: "Run `ls` in this directory and tell me what you see." If your Codex runs `ls` without asking, use
  "Create an empty file named scratch.txt with the shell command `touch scratch.txt`" instead.
- **File request**: "Create a file named notes.txt containing the word hello."

Only a request the notification can show whole gets an Approve button there: a shell command, a URL, a file to read. A file
edit, a new file or a patch shows only its path, so its notification offers Deny only (`approvalScope` in
`packages/plugin/src/approval-preview.js`). Use the command request for the notification approval steps.

## 1. Codex

Expected from the code: Chat, send, Blocked card (command, edit and network approvals, and question views), modes (Plan Mode
or Default Mode), shortcuts, Usage, a notification on an ask and on done, and Approve from a notification.

1. **Agent on Home.** Start `codex` in the pane. On the phone, open Home.
   Expect: the Agent appears under the Host as Codex, with the repository's name, and its status changes between idle and
   working when you send a prompt in the terminal.
   If not: capture kit.
2. **Chat reads the conversation.** In the terminal, send "Say hello and list the files in this folder." and let it finish.
   On the phone, open the Agent and its Chat.
   Expect: your message and Codex's reply as chat messages, with tool calls and results as rows. Codex reports its
   conversation only after a prompt, so a notice asking you to send one, shown before the first prompt, is correct.
   If not: capture kit, and the exact error text Chat shows, if any.
3. **Send a message.** In Chat, type "Reply with the single word pong." and send.
   Expect: the message shows in Chat, reaches Codex in the terminal, Codex answers, and the answer shows in Chat.
   If not: capture kit; say whether the message never reached the pane or reached it and Chat did not show it.
4. **Send is held while a draft is in the box.** In the terminal, type some text without pressing Enter, then try to send
   from Chat.
   Expect: Chat refuses, saying the input box already has text. Clear the box afterwards.
   If not: capture kit.
5. **Blocked card, Approve.** With Codex in untrusted mode, send the command request.
   Expect: Home shows the Agent as blocked. Chat shows a Blocked card with the command, its reason, and Approve and Deny.
   Tap Approve (the plain one, never an "always" or persistent option). Codex runs the command and continues; the card goes
   away.
   If not: capture kit, taken while the prompt is still on screen and before you answer it in the terminal.
6. **Blocked card, Deny.** Send the command request again. Tap Deny.
   Expect: Codex does not run it and carries on or stops, as Codex does after a refusal; the card goes away.
   If not: capture kit.
7. **File edit approval.** Send the file request.
   Expect: a Blocked card for the edit, with the file path. Approve or Deny; the repository is throwaway. `notes.txt` exists
   only if you approved.
   If not: capture kit.
8. **Open question with options.** Switch Codex to Plan Mode (the composer's shortcuts menu has Plan Mode, Shift+Tab), then
   send: "Plan a tiny script to count the lines in README.md, and ask me one clarifying question with options before you
   start."
   Expect: when Codex shows a question view, the Blocked card shows the question and its options, and tapping an option
   answers it in the terminal. If your Codex version never shows a question view for this prompt, write "not reached" in the
   notes; it is neither pass nor fail.
   If not: capture kit while the question is on screen.
9. **Modes.** Look at the mode shown for the Agent in Plan Mode, then in the default mode.
   Expect: "Plan Mode" while Codex's footer says Plan mode, "Default Mode" otherwise.
   If not: capture kit.
10. **Shortcuts.** Open the composer's shortcuts menu.
    Expect: Interrupt (Esc), Plan Mode (Shift+Tab), Edit a Previous Prompt (Esc Esc), /new, /compact, /model, /resume,
    /review, /diff, /status. While Codex works, tap Interrupt: Codex stops its turn. Tap /status: the command is sent.
    If not: capture kit.
11. **Usage.** Open the Usage tab, with a Codex login on the Host that has made at least one request.
    Expect: a Codex card with its plan limits and reset times, read from Codex's own data on the Host. If there is none yet,
    run one more prompt and refresh.
    If not: screenshot, and the names (not contents) of the files in Codex's home directory on the Host.
12. **Push notification, app closed.** Force-close the app and lock the phone. In the terminal, send the command request.
    Expect: within a few seconds a push says the Agent is blocked, with the project name. Tap it: the app opens on that
    Agent. Then let a normal prompt finish: a push says the Agent is done.
    If not: screenshot of the lock screen; say which relay you used; capture kit.
13. **Approve from the notification.** Force-close the app. Send the command request. Pull the push down (long press).
    Expect: the notification offers Approve and Deny. Approve (the app may ask you to confirm), and Codex runs the command.
    Repeat with the file request: its notification offers Deny only. That is expected; Approve there is not.
    If not: screenshot of the notification actions; capture kit.
14. **Live Activity Approve and Deny.** If a Live Activity shows while Codex is blocked, its Approve and Deny open a
    confirmation sheet in the app. Confirm one.
    If not: screenshot.

## 2. OpenCode

Expected from the code: Chat (read from OpenCode's session store on the Host, not from a transcript file), send, Blocked card
for permissions and questions, modes (Build and Plan, with Auto-Accept variants), shortcuts, and a notification on an ask and
on done.

**Not expected** for OpenCode:

- Approve from a notification. Its permission prompt has no numbered options, so its notifications carry no approval
  fields and stay a plain Blocked alert.
- Live Activity Approve and Deny (they need Claude Code or Codex prompts).
- A Usage card. The OpenCode Go collector is a stub that reports nothing, so no card appears.

Steps:

1. **Agent on Home.** Start `opencode` in the pane.
   Expect: the Agent appears on Home as OpenCode. It reports a conversation only once one is open.
   If not: capture kit.
2. **Chat reads the conversation.** In the terminal, send "Say hello and list the files in this folder."
   Expect: your message and OpenCode's reply as chat messages. Before any conversation exists, Chat says herdr has not
   reported one yet and asks you to send a first message; that is correct.
   If not: capture kit, and the exact error text Chat shows. An error about OpenCode's session store is a finding.
3. **Send a message.** In Chat, send "Reply with the single word pong."
   Expect: it shows in the terminal, OpenCode answers, and the answer shows in Chat.
   If not: capture kit.
4. **Slash commands.** In Chat, send `/compact` alone. Expect: it runs. Then send `/compact now`.
   Expect: Chat refuses (OpenCode's `/compact` takes no instructions).
   If not: capture kit.
5. **Blocked card, Approve.** With `bash: ask` set, send the command request.
   Expect: a Blocked card for "Permission required" with the command and the options Allow once, Always allow (when
   OpenCode shows it) and Reject. Tap Allow once. Never tap Always allow. OpenCode runs the command; the card goes away.
   If not: capture kit, taken while the prompt is on screen.
6. **Blocked card, Reject.** Send the command request again and tap Reject.
   Expect: OpenCode does not run it. If OpenCode then asks what to do differently, the card tells you to answer in the
   terminal; that is expected.
   If not: capture kit.
7. **File edit permission.** Send the file request.
   Expect: a Blocked card for the edit (the diff stays in the terminal). Allow once or Reject; either is fine here.
   If not: capture kit.
8. **Open question with options.** Send: "Use your question tool to ask me which of two colors I prefer, with options."
   Expect: a Blocked card for the question with its options and, when OpenCode offers it, a "Type your own answer" choice.
   Tap an option; OpenCode continues with it. If OpenCode has no question tool in your version, write "not reached".
   If not: capture kit while the question is on screen.
9. **Modes.** Switch between Build and Plan in the terminal (Shift+Tab; OpenCode 2.1.3 ignores Tab).
   Expect: the app names the mode: Build, Plan, and the Auto-Accept variants when OpenCode draws them. When OpenCode draws
   no mode, the app shows none; that is expected.
   If not: capture kit.
10. **Shortcuts.** Open the composer's shortcuts menu.
    Expect: Interrupt (Esc), Switch Agent (Shift+Tab), /new, /compact, /undo, /redo, /models, /sessions. Known gap
    (agent lab): a command other than /compact is refused when sent from Chat, and from the terminal surface its
    trailing space makes OpenCode send it to the model. While OpenCode works, tap Stop: it presses Esc twice and OpenCode stops.
    If not: capture kit. A Stop that did not take shows a notice that OpenCode still shows Working.
11. **Usage.** Not expected. Confirm only that the Usage tab shows no OpenCode card and no error for it.
12. **Push notification, app closed.** Force-close the app and lock the phone. Send the command request.
    Expect: a push that the Agent is blocked; tap it and the app opens on that Agent. Let a prompt finish: a push that it is
    done. The Agents Pocket plugin installs a plugin file into OpenCode's config `plugins` folder, and OpenCode must be
    restarted after the install.
    If not: screenshot; check that the file exists; say which relay you used.
13. **Approve from the notification.** Not expected. With the app closed, the blocked push should be a plain alert with no
    Approve button. Open the app from it and answer on the card instead. If an Approve button does appear, record it as a
    finding, not a pass.

## Results

One cell per row: pass, fail, or not expected. Leave a cell empty until you have seen it on the phone.

| Capability | Codex | OpenCode |
|---|---|---|
| Agent appears on Home | | |
| Chat reads the conversation | | |
| Send a message | | |
| Blocked card: Approve | | |
| Blocked card: Deny or Reject | | |
| File edit approval card | | |
| Open question with options | | |
| Modes | | |
| Shortcuts | | |
| Usage | | |
| Push notification, app closed | | |
| Approve from a notification | | |
| Live Activity Approve and Deny | | |

Versions: Codex ____ , OpenCode ____ , app ____ (build ____ ), relay: default / own.
Date and tester: ____
