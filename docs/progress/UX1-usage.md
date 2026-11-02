# UX1-usage: assemble Usage quick sheet and full dashboard from the cloned components
status: partial
branch: see git branch of this worktree
changed: apps/mobile/src/usage (new: UsageHeader, UsageLimitsStrip, UsageChartSection, UsageHostsSection, UsageBreakdownSection, UsageBreakdownListScreen, LimitsHostGroup, usageModel; rewritten: UsageScreen, DaySheet, LimitsScreen, QuickSheet; edited: QuickCardView, LimitWindowRow, UsageNotices; removed: DailyChart, BreakdownList, UsageControls, UsageTotals), apps/mobile/src/dev/atlas (7 usage ids), packages/ui (UsageTotals status + anchored scope press, Sheet headerless, programTint and UsageHostGroup exports)
tests: pnpm verify-fast green; apps/mobile jest src/usage 12/12
acceptance:
- full Usage order (scope + Updated, Est. Cost|Tokens, Today/7/30, hero, limits chips, chart, calendar, Hosts, Programs, Breakdown): met, see usage.tab sheet
- calendar 5-step ramp, today outlined, not-recorded hatched, tap opens day sheet: met (leading week drawn hatched like Swift)
- quick sheet: Usage title, cards with plan pill, bars with pace tick, pinned primary "Open full Usage" plus caption: met
- limits sheet grouped by Host with Claude Code switch and Accounts row, compact window rows: met
- day sheet: step arrows, By Host, By program with split bars, Models/Directories links that push usage.breakdown-list, 0.65 detent, whole body scrolls under the grabber: met
- scope menu: ActionMenu anchored under the pill, per Host est. cost subtitle: met
- wide layout (usage.ipad-split, usage.wide-layout): Host column (All Hosts + each Host with share, Not included) beside the two-column dashboard from 1160 pt windows: met (atlas ids marked device ipad, two available Hosts)
- Breakdown: four rows, Show All row in the card pushes /usage-breakdown?kind=&metric=&host=; amount right-aligned with share beneath: met
- quick sheet with Claude Code limits off: card carries the switch and consent note: met (usage.quick-sheet--limits-off)
- Accounts notice (lone connected Host) and Host detail Usage section: met
evidence: scratchpad rn/evidence/UX1-usage-r3 (Swift | RN sheets, dark + papel, captured after the last commit on a clean Metro cache, port 8631)
left:
- iOS pass (sheet detents, glass capsule) NOT done: needs the integrator. The only booted simulator and Metro 8081 belong to another agent, and workers do not run simulators (docs/agents/swarm.md). Capture usage.day-sheet and usage.quick-sheet--limits-off with scripts/atlas-ios.mjs against a Metro on this branch.
- Intentional skin/platform differences on usage.tab: Swift presents Usage as a sheet (large title + Done pill); RN is a pushed route with the native stack header (Usage title, back). Calendar ramp is the same ink-over-track ramp as Swift; empty days read indigo-tinted because the control token is indigo in the new skin.
notes:
- Review fixes: atlas ids added usage.host-section, usage.hosts-section, usage.ipad-split, usage.wide-layout, usage.accounts-notice, usage.account-rename-alert, usage.account-remove-confirm, usage.quick-sheet--limits-off, usage.breakdown-list--directories; scripts/atlas-web.mjs captures ids with device ipad at 1366x1024 (<id>.ipad.png). Atlas-only second Host lives in dev/atlas/atlasUsage.ts. New route /usage-breakdown; /usage?host= scopes the dashboard.
- Maestro: e2e/*.yaml (home, hosts, live) use no usage testID, checked by grep. New testIDs: usage-breakdown-show-all, usage-day-link-<kind>, usage-accounts-notice(-open), usage-hosts-column, usage-host-<id>, host-usage-section.
- testIDs changed: usage-range-<id>, usage-metric-<id>, usage-scope-menu-<id>, claude-limits-toggle-<hostId>, usage-total (hero figure), heat-<date> (calendar cells replace bar-<date>); Days rows live under Breakdown > Days. No Maestro flow used them.
- Metro on web serves stale code in this worktree; restart with --clear and use a unique port (other agents kill servers).
- Round 3: merged main; limit chips now Swift-compact (ring 36, subheadline) and pick the tightest window like Swift; chart plot 128 pt; atlas usage.tab shows the stack header. File-length limit: the 150 line cap applies only to app/** and *Screen.tsx; UsageWide, BreakdownRows (400 cap) and UsageScreen.test.tsx are not screens, so no split is needed.
