# Brief: Agent detail (header, switcher, chat, blocked card, composer, terminal)

Task: UX1-agent-detail (largest family; split across two PRs if needed: chrome+composer, then chat+blocked+terminal).
RN today: `apps/mobile/src/agent-detail/*`, `apps/mobile/src/blocked/*`, `packages/ui/src/composer`, `terminal`, `markdown`, `keys`.
Read [../design-system.md](../design-system.md) first.

## Swift screens

| Screen id | Atlas folder (iPad; dark and Papel) |
|---|---|
| `agent-detail.container`, `.header`, `.header-more-menu`, `.status-line`, `.agent-switcher`, `.composer`, `.composer-add-menu`, `.composer-more-menu`, `.terminal` | `testAgentDetailTerminal/` |
| `agent-detail.chat`, `.chat-timeline` | `testChat/` |
| `agent-detail.chat-banners` | `testChatBanners/` |
| `agent-detail.chat-blocked-card` | `testChatBlockedCard/` |
| `agent-detail.chat-command-suggestions`, `.chat-tools-keyboard` | `testChatComposer/` |
| `agent-detail.composer-skill-suggestions` | `testDemoSkillSuggestions/` |
| `agent-detail.session-drawer`, `.session-drawer--agents` | `testSessionDrawer/` |
| `agent-detail.direct-input`, `.terminal-toolbar`, `.terminal-toolbar-dpad`, `.terminal-toolbar-more-menu`, `.direct-input-more-menu` | `testDirectInput/` |
| `agent-detail.tools-keyboard`, `.control-keys`, `.skills-pane`, `.snippets-pane`, `.terminal-appearance-pane` | `testToolsKeyboard/` |
| `agent-detail.terminal-status-overlay` | `testTerminalStatusOverlay/` |
| `agent-detail.attach-links`, `.close-confirm`, `.open-terminal-chooser`, `.shell-terminal`, `.shell-keys-dock`, `.skills-picker`, `.snippets-manager`, `.snippet-editor` | `testAttachLinks/`, `testAgentLifecycleSheets/`, `testOpenTerminal/`, `testShellTerminal/`, `testSkills/`, `testSettingsInput/` |

Swift sources: `Console/AgentDetailView.swift`, `AgentDetailHeader.swift`, `AgentDetailStatusChrome.swift`, `AgentComposerView.swift`,
`AgentComposerButtons.swift`, `Terminal/TerminalAgentSwitcher.swift`, `Chat/Blocked/BlockedCardView.swift`, `Chat/Timeline/*`.

## What makes it good

- **Content is the screen**. No navigation bar: chat or the live terminal fills the display edge to edge, and chrome floats over
  it as small glass capsules (see header). The same detail hosts Chat and Terminal; the **program-logo toggle** (the Agent's logo,
  with a speech-bubble or `>_` badge for the other surface) sits in the composer row, not in the header.
- **One control strip, bottom**: status line (tiny, informational) -> composer card -> agent switcher row. The switcher is a
  40 pt row of chips (program logo with status dot, title; Working pulses) scrolling horizontally, with pinned trailing
  controls (hide/show composer, keyboard-type switch, keyboard toggle). Switching agents is one tap with no navigation.
- **The Blocked card replaces the composer's input area** in Chat: the question is answered where you type. Options are full-width
  buttons; the lead option (Yes) is solid accent, others are `surface` with a hairline, destructive (No) is a danger wash. A
  warning line under a rule-saving option. Progress states: ready, acting (spinner), unconfirmed (adds Stop).
- **Chat is quiet**: user bubbles right (a `control`-filled capsule-ish bubble, radius 16), assistant text full width markdown
  with no bubble, tool activity as compact rows (icon, name, summary, trailing state "Waiting"/"Exit 1"), "Worked for 26s" and
  "Thought for 4s" disclosure rows, subagent card with its own transcript, a background-work strip above the composer
  ("1 running . Find other retry callers"), compaction divider centered ("Context compacted").
- **Status line** (caption2): status dot/orb + word in the status color, `|` divider, branch glyph + name (blue) with ahead/behind
  counts, diff totals right-aligned (`+2 -2`), latency, context-left, host telemetry. Tapping the git stretch opens Changes.
- **Terminal**: the real PTY surface (`terminalBackground`), toolbar capsule floating above the keyboard (agent logo, Ctrl, Esc, Tab,
  D-pad, keyboard switch, more), light haptics on every key.
- **Session drawer** (left edge): current Host only, search "Workspaces, tabs, panes", Tree/Agents toggle; Agents view reuses
  the Home inbox projection (Needs you / Working / Done / Idle / Shells) with compact cards.

## Layout notes

Header (floating, 44 pt controls, 8 pt apart; `AgentDetailHeader.controlSize` 44): expanded = leading capsule [Back | Sessions],
title capsule (flex, 44 high, padding 16: line 1 title 15 semibold; line 2 12pt secondary at 60%: program mark 12, harness, `.`,
model mono, `.`, directory head-truncated), trailing "..." circle. Folded = Sessions circle + More circle only (More menu
has Changes and Collapse/Expand). Glass at 80%. x1.3: paddings 16 -> 21; control size stays 44.
Composer: card radius 24 -> 16, `regularMaterial` -> `surfaceRaised`, horizontal margin 12 -> 16, vertical 8 -> 10; input min
height 36; "+" and logo toggle and "..." are 32 pt glyph circles in 44 pt targets; Send is an accent 32 circle with `arrow.up`;
Stop is a `danger` circle. Chat composer folds to one line while the keyboard is down. Supports drop of files/images, photo
attach, dictation mic, skill (`/`) and command suggestions inline above the input.
Blocked card: 12 -> 16 padding, 10 -> 13 gaps; option button radius 12 -> 8, padding 12x10 -> 16x13, label body (semibold for
the lead), detail caption at 75%; progress text caption medium; "Add a Note" row footnote with leading glyph.
Chat width capped at a reading column (`ChatTimelineMetrics.maximumContentWidth`; RN `metrics.readableWidth` 720). Background
of Chat is the system/plain background in Swift ("not themed"); Índigo: canvas (it must read as the same app).

## Índigo adaptation

- Accent is the lead action color (Yes, Send, active chips). Status inks from tokens; branch glyph uses `info`.
- Blocked card gets the Needs-you outline (statusBlocked 40%) around the whole card so it reads from across the room.
- Terminal chrome keeps `terminalBackground`/`terminalForeground`; capsule toolbar is `surfaceRaised` + hairline.
- Papel: terminal background stays light (token); header glass fallback is `surfaceRaised` 80%.

## Acceptance checklist

- [ ] No stack header on Agent detail; floating capsules: [Back | Sessions], title capsule with two-line title, "..." circle; folded variant works.
- [ ] Bottom stack, top to bottom: status line, composer card, switcher row (40 pt, chips scroll, trailing controls pinned).
- [ ] Switcher chip = logo with corner status dot (Working pulses) + title; tap switches agent in place; long-press pins.
- [ ] Program-logo toggle between "+" and "..." flips Chat/Terminal (RN's Chat/Terminal chips in the header are removed).
- [ ] Blocked card replaces the input area; lead option solid accent, secondary options hairline cards, No as danger wash; question in mono block; outline in blocked color.
- [ ] Chat: user right bubble radius 16, assistant text flat markdown, tool rows compact with state, disclosure rows for "Worked for"/"Thought for", compaction divider.
- [ ] Status line shows status word, git branch with counts, diff totals right; tapping it opens Changes.
- [ ] Terminal toolbar capsule floats above the keyboard; keys give light haptics.
- [ ] Session drawer from the leading edge: search, Tree/Agents toggle, inbox-style cards.
- [ ] Banners: connecting / not connected / couldn't read are tinted washes with Retry and Show Agent Terminal.
- [ ] Timings: composer fold 200 ms, overlay open 280 ms, all gated by reduce motion.
