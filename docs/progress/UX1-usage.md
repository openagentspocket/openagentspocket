# UX1-usage: assemble Usage quick sheet and full dashboard from the cloned components
status: done
branch: see git branch of this worktree
changed: apps/mobile/src/usage (new: UsageHeader, UsageLimitsStrip, UsageChartSection, UsageHostsSection, UsageBreakdownSection, UsageBreakdownListScreen, LimitsHostGroup, usageModel; rewritten: UsageScreen, DaySheet, LimitsScreen, QuickSheet; edited: QuickCardView, LimitWindowRow, UsageNotices; removed: DailyChart, BreakdownList, UsageControls, UsageTotals), apps/mobile/src/dev/atlas (7 usage ids), packages/ui (UsageTotals status + anchored scope press, Sheet headerless, programTint and UsageHostGroup exports)
tests: pnpm verify-fast green; apps/mobile jest src/usage 12/12
acceptance:
- full Usage order (scope + Updated, Est. Cost|Tokens, Today/7/30, hero, limits chips, chart, calendar, Hosts, Programs, Breakdown): met, see usage.tab sheet
- calendar 5-step ramp, today outlined, not-recorded hatched, tap opens day sheet: met (leading week drawn hatched like Swift)
- quick sheet: Usage title, cards with plan pill, bars with pace tick, pinned primary "Open full Usage" plus caption: met
- limits sheet grouped by Host with Claude Code switch and Accounts row, compact window rows: met
- day sheet: step arrows, By Host, By program with split bars: met (Models/Directories links not built)
- scope menu: ActionMenu anchored under the pill, per Host est. cost subtitle: met
- wide layout (usage.ipad-split, usage.wide-layout) Host column: not met
evidence: scratchpad rn/evidence/UX1-usage (Swift | RN sheets, papel/ RN shots)
left:
- usage.ipad-split / usage.wide-layout Host column, usage.host-section (Hosts family), usage.accounts-notice, account alerts atlas entries
- Day sheet Models/Directories link rows; breakdown list rows right-aligned amount with share under it
- Show All expands in place; Swift pushes usage.breakdown-list (screen exists in atlas, not routed)
- demo data has one Host, so the Hosts section and iPad cards are not visible in the atlas
notes:
- testIDs changed: usage-range-<id>, usage-metric-<id>, usage-scope-menu-<id>, claude-limits-toggle-<hostId>, usage-total (hero figure), heat-<date> (calendar cells replace bar-<date>); Days rows live under Breakdown > Days. No Maestro flow used them.
- Metro on web serves stale code in this worktree; restart with --clear and use a unique port (other agents kill servers).
