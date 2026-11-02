# RN vs Swift: what the RN screens lack

Read from the atlas Swift | RN sheets (`design/atlas/compare`, dark, Expo web captures of 2026-11-02; Swift
shots from lead-qa / design/screens/current, which predate the Índigo skin: ignore color, compare structure).
Worst first inside each family; families ordered by how far RN is from Swift. The skin (Índigo, radius 8,
hairline, x1.3 spacing) is a given; this list is only structure, hierarchy, components and interactions.
Regenerate the sheets with the commands in docs/agents/swarm.md ("UX loop").

Ids with no RN screen at all (151 of 172 Swift ids; the full list is `design/atlas/compare/unmapped.txt`):
most of agent-detail.* (chat timeline, composer menus, keyboards, drawers, sheets), console.* sheets and menus
(quick detail, context menu, host filter, presentation, workspace picker, directory browser, rename,
terminals list), settings.* sub-pages (theme, appearance, chat, agent list fields, overlay networks, toolbar,
chat cache), usage.* sheets (quick sheet, day, accounts, scope menu), hosts.* alerts and guides, widgets.*,
shell.* (sidebar, switcher, app lock, banner, commands), files.* sheets, browser.preview.

## 1. Agent detail (agent-detail.container / terminal)

- The screen is a stack of header, a giant agent switcher and a placeholder ("Chat arrives with the conversation
  engine"). Swift is a full-bleed content surface: the terminal or chat fills the screen and everything else floats.
- Switcher: RN draws four tall (~220pt) tiles that eat the screen. Swift has a compact switcher inside the composer
  dock (current agent chip, status dot, other agents as a horizontal strip below the input).
- No composer card: RN has a bare pill input plus a send arrow. Swift has one rounded card: multiline input, then
  a row of round buttons (add, agent tools, more) and a red stop button while working, plus a status line above it
  (status, branch, ahead/behind, diff +/-, latency).
- Header: RN shows a large avatar plus two lines plus Chat/Terminal pills in the content. Swift has a nav bar with a
  sidebar button (leading), a title block (project, agent name) and a single "..." menu; the Chat/Terminal choice
  lives in that menu.
- Terminal: RN shows a small 120pt box. Swift gives the terminal the whole area under the nav bar, with the key
  toolbar docked above the keyboard (Ctrl, Esc, Tab, d-pad, more).
- Blocked agents show the question inside the terminal/composer area; RN has no blocked card in this screen.

## 2. Agents list (console.agents-list-flat)

- Rows are RN cards with a title and one truncated subtitle ("question - host - workspace..."). Swift rows are flat
  rows with hairline separators and four pieces of data: agent name + kind, status badge (Blocked, Working, Done,
  Idle, with percent when low), the blocked question or last line in status color, host and path, diff +/-.
- Header: RN has a "Search Agents" label above an empty filled input, then two bare icons. Swift has a large title
  "Agents", a Home button on the left and a floating capsule with filter, list-style and "+" actions.
- Missing: grouped modes (by host, workspace, status) with collapsible sections, row context menu, swipe Close,
  quick-detail sheet, empty states per filter.
- RN shows no section titles or counts in the flat list, so the status order (blocked, done, working) is unexplained.

## 3. Home (shell.home, console.no-hosts-empty)

- Title block: RN shows the app name small in a nav bar with four icon buttons (usage ring, hosts, gear, more).
  Swift has a large "Agentico" title and a two-button capsule (usage, settings); hosts and new live elsewhere
  (floating "+" button bottom right).
- Sections: RN has Needs you / Working / Done cards (good) but each card is ~150pt with large internal padding;
  Swift cards are ~60-80pt (title row with time, one summary line, chips). RN lacks the "N idle / See all" footer
  line and the Sessions strip (horizontal cards for shells and agents with a live terminal preview).
- No floating "+" button; the RN menu hides New Agent behind "...".
- Relative time reads "now" for everything in the demo (every state-change seq maps to the pinned clock): the
  demo data should carry distinct ages (4m, 7m, 18m, 25m).
- Empty state: RN is top-aligned with a primary "+ Add Host" button; Swift centers the block vertically in the
  screen and adds a secondary "Setup Guide" link under the button, with copy about herdr, Agents and Terminals.
- Hosts card section sits at the bottom in both; RN has no connection state text or latency.

## 3b. Home: accepted gaps after UX1-home review

- Skin decision: inbox card titles are subheadline semibold (as Swift); Agent list row titles stay headline.
- The Fab is 56 pt (brief says 58); New Terminal uses the first Host; Sessions strip lists Agents only (no shell tabs yet).
- Setup Guide on No Hosts opens the repository: there is no in-app guide screen.
- Details in the row long-press menu opens the Agent detail (no quick-detail sheet yet).
- Not captured: two-column layout at width >= 600, AX-size stacked header, Papel sheets besides shell.home.

## 4. Hosts (hosts.list, hosts.detail, hosts.form, hosts.pairing-scanner)

- hosts.list: RN leads with two full-width buttons (Scan to Pair, Add Host) above the list. Swift has a large
  "Hosts" title, a Done button and a capsule with scan and "+", no stacked buttons. Rows lack the latency
  ("<1 ms") and use a smaller dot instead of the server glyph with a status dot.
- hosts.detail: RN opens with a status card that says "Connecting..." plus Stop Connecting while the preflight is
  pending; Swift shows Connected + route + a round refresh button. Swift has Routes (with "In Use" pill),
  Host (account, session, auth, plugin version) and Preflight with a "Run Checks Again" link in the section
  header. RN has no Host key/value block in the first screen.
- hosts.detail trust prompt: appears by itself in the demo (the probe asks first); Swift shows it only on
  first connect. Keep it deterministic for captures (hosts.trust-alert has its own id).
- hosts.form / pairing: RN has no camera on web, so the scanner is a code-paste screen there; compare on iOS.

## 5. New agent (console.start-agent)

- RN is a modal with the title in the nav bar and Cancel / Start as bare buttons on a second row, so the title
  sits left, not centered. Swift has a centered title between Cancel (left) and Start (right, disabled until valid).
- Section order differs: RN starts with Recent directories (Swift has no such list on this screen: Host, Workspace,
  Worktree toggle, Agent, Agent Name, Tab Name, Arguments). RN lacks Agent Name, Tab Name, Arguments and a Host row.
- Rows: Swift uses rounded grouped rows with chevron-updown pickers; RN uses cards with a smaller chevron.

## 6. Usage (usage.tab, usage.limits-page)

- RN has no title or toolbar: filter chips (hosts) and range chips wrap onto three lines at the top. Swift has a
  large "Usage" title with "Updated hh:mm", Done and an All Hosts menu in the nav bar, and two segmented controls
  in one row (Est. Cost / Tokens, Today / 7 Days / 30 Days).
- RN lacks the big cost headline (US$ 47,10 / tokens on N hosts), the per-host Usage Limits strip with progress
  rings and a Details link, the stacked area chart with hold-to-read, and the day calendar heat map. It has a
  bar chart and a flat token table instead.
- Numbers: RN formats USD as `$4.38`; Swift formats by locale (`US$ 47,10`).

## 7. Settings (settings.root, notifications, notification-privacy)

- settings.root: RN uses UPPERCASE section labels and a flat single-line list; Swift uses title-case labels
  (Appearance, Agents, Input, Hosts and Network), a large "Settings" title and a Done button, and shows the
  current value on the right of each row (Theme with color dots + name, Fonts & Size, Notifications Off, Hosts 2).
- Missing rows: Agent Rows, Snippets, Overlay Networks, and a chevron-right value column. RN adds a Demo Mode switch
  in the main list (should live in a dev section) and a Help section Swift does not show on the first screen.
- Row glyphs are thin and gray in RN; Swift uses larger SF Symbols in a fixed-width leading column.

## 8. Files, Changes, Ports (files.browser, changes.list, browser.ports)

- files.browser: RN has no nav bar title row (a "demo" title with "~" crumb sits inside the content) and rows with no
  separators. Swift has Done, a centered folder name, an up-arrow + "+" capsule, a breadcrumb chip, and rows with a
  green folder glyph and an absolute modification date. RN shows size in bytes; Swift shows `40 bytes . date`.
- changes.list: RN opens with a large repository card of five loose lines; Swift has a compact card (repo name +
  Worktree badge, branch with ahead/behind arrows, last-commit line, "Possibly incomplete" note) and a CHANGES list
  with file name, folder in a lighter weight, +/- counts and a one-letter status. RN splits into Conflicts / Staged /
  Changes / Untracked sections (more than Swift) and spells out "lines" after every count.
- Back button: Swift draws a round back button with a centered title; RN relies on the stack header.

## 9. Cross-cutting

- Navigation chrome: Swift screens present as sheets with Done (settings, hosts, usage, files) and use round glass
  buttons and capsules for toolbars; RN pushes everything on one stack with default headers and no capsule groups.
- Large titles: Swift uses a large title (34pt bold) on list screens; RN uses the small centered/left nav title.
- Density: RN cards carry ~28pt internal padding and ~40pt between sections even before the requested x1.3; Swift
  rows are 56-72pt tall. Check the token spacing before scaling: several RN primitives already apply 1.3.
- Section labels: RN uses uppercase tracked captions; Swift uses title-case semibold gray. Pick one deliberately.
- Terminal and chat surfaces are the heart of Swift; RN has neither on web (PlainTerminal) and a placeholder for chat.
- Atlas caveats: web has no glass, native menus or safe-area insets (RN headers look shorter than on iOS);
  changes.file-diff needs a selected file; usage.limits-page, browser.ports and rn.board have no Swift shot yet.
