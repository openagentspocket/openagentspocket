# What the Swift app had (2026-11-06, updated 2026-11-07)

Read from code, neither app was run. Checked by hand: background grace, Jump Host, key lock, Board.

Neither app ever had Mosh. Sessions live on the Host; the phone reconnects (backoff, 30 s keepalive).

Missing or worse here, by user impact:

1. Approve and Deny without opening the app (Swift: own connection, no UI), and from the Live Activity. expo-notifications calls iOS's completion handler at once, so a background SSH cannot finish; the actions open the app.
2. Chat rows: a tool output cut short shows its start only.
3. Terminal: Message Jump is in the "..." menu on herdr, walking on screen reads, not Swift's floating buttons; off on tmux, whose wheel enters copy-mode. Pinch zoom may reset the grid (not checked on a device); no ⌘ commands (needs a native module).
4. iPad: this app is iPhone only and portrait.
5. Apple Watch, Shortcuts and App Intents, widget refresh in the background.
6. Embedded overlay networks (removed on purpose).
7. Windows Hosts, though Easy Pair offers them.
8. Word diff, references from Changes, image drop.

Better here: Android (push with the app closed still looks unfinished), tmux, Hermes Chat, Easy Pair and the
installer, more Usage providers, crash records. 