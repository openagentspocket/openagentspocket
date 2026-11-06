# What the Swift app had (2026-11-06)

Read from code, neither app was run. Checked by hand: background grace, Jump Host, key lock, Board.

Neither app ever had Mosh. Sessions live on the Host; the phone reconnects (backoff, 30 s keepalive).

Missing or worse here, by user impact:

1. Approve and Deny without opening the app (Swift: own connection, no UI), and from the Live Activity.
2. Background grace: Swift kept connections 15 s; here any state but `active` suspends them, Face ID included.
3. Chat rows: tool output (check whether it is fed), diff, image preview, copy.
4. Jump Host: the form exists and the connection always fails (`hostFeatureUnavailable`).
5. App lock for SSH keys: `appLockForKeys` has no consumer.
6. Dictation (SpeechAnalyzer in Swift).
7. Terminal: Select Text, Attach Links, Message Jump are unused; pinch zoom may reset the grid; no ⌘ commands.
8. iPad: this app is iPhone only and portrait.
9. Apple Watch, Shortcuts and App Intents, widget refresh in the background.
10. Embedded overlay networks (removed on purpose).
11. Windows Hosts, though Easy Pair offers them.
12. Word diff, references from Changes, image drop.

Better here: Android (push with the app closed still looks unfinished), tmux, Hermes Chat, Easy Pair and the
installer, more Usage providers, crash records. Board exists but nothing links to it.
