# Brief: Usage

Task: UX1-usage. RN today: `apps/mobile/src/usage/*` (UsageScreen, QuickSheet, LimitsScreen, DailyChart, BreakdownList),
`apps/mobile/src/home/UsageRing*`, `packages/ui/src/primitives/{BarChart,Meter}.tsx`. Read [../design-system.md](../design-system.md) first.

## Swift screens

| Screen id | Atlas |
|---|---|
| `usage.tab` (full Usage; sheet on phone, detail column on iPad) | `ScreenAtlasTests/testUsage/` |
| `usage.limits-sheet` | `testUsage/` (Papel too: the best Papel reference) |
| `usage.breakdown-list` | `testUsage/` |
| `usage.quick-sheet` | none; `Usage/UsageQuickSheet.swift` |
| `usage.ipad-split`, `usage.wide-layout` | `testUsage/usage.tab.png` is the split |
| `usage.day-sheet`, `usage.accounts-sheet`, `usage.scope-menu`, `usage.host-section` | no image; `Usage/AgentUsageSheets.swift`, `ClaudeAccountsSheet.swift` |
| `settings.usage` | `testSettingsUsage/` |
| widgets (`widgets.usage-widget`, live activity) | out of scope here |

## What makes it good

- **Answer first, detail on demand.** Ring in Home's bar -> a small sheet of reset-aware bars; "Open full Usage" at its foot goes
  deeper. The quick sheet: title "Usage" with round close (x), one card per Account/program per Host (program logo, "Claude Code .
  Host", plan pill, updated age), each limit window = name, percent, bar with a white **pace tick** (where an even burn would be),
  clock + time to reset. Footer pinned: "Open full Usage". Pull to refresh polls every Host.
- Full Usage is a dashboard in this order: header with **scope menu** ("All Hosts" or one Host, subtitle "Updated 01:12" or
  "Refreshing"), segmented **Est. Cost | Tokens** and **Today / 7 Days / 30 Days**, hero number (title bold, e.g. US$ 47,10) with
  caption secondary "44,9M tokens on these 2 Hosts", **Usage Limits . per Host** chips row (ring 22 + names, horizontal scroll,
  "Details" accent on the right), **line/area chart** by program (hold to read a day), **calendar heat map** of days (7 columns,
  5-step ramp, today outlined in accent, "Not recorded" hatched), **Hosts** card list with cost, share % and tokens, **Programs**
  stacked share bar + rows with colored dots, **Breakdown** with Models / Directories / Days segmented control and Show All.
- iPad: the left column lists "Estimated API cost . Last 30 days" with **All Hosts / each Host** as selectable cards (cost large,
  share bar), selection ring accent. Phone: scope menu replaces that column.
- Limits sheet: grouped by Host, each with "Claude Code limits" switch + Accounts row, then program cards with per-window rows.

## Layout notes

Cards radius 8 on `surface` with hairline; internal padding 16 -> 21; between dashboard blocks 24 -> 31; chart height ~ 160 + axis
labels caption2; calendar cell: square, radius 6, gap 5, 7 columns, weekday letters caption2 secondary. Hero amount `largeTitle` bold
tabular figures; scope subtitle caption secondary. Meters: 6 pt track `control`, fill by level (accent normal, warning >= 75%,
danger >= 90%: reuse `meterColor` thresholds), pace tick 2 x 10 `textPrimary` at 80%.
Segmented controls: iOS segmented look: `control` track, selected segment `surfaceRaised` + hairline (RN has none: add `Segmented`).

## Índigo adaptation

Chart series colors come from `ProgramMark` brand tints (token file `brands.generated.ts`), never hex in screens. Heat ramp = 5 steps
from `control` to `accent` (Papel: from `control` to `accentStrong`). Today outline `accent`. Costs always formatted by locale.

## Acceptance checklist

- [ ] Ring in Home -> quick sheet: round close, per-account cards with plan pill, bars with pace tick and reset clock, pinned "Open full Usage".
- [ ] Full Usage order: scope header, metric + range segmented controls, hero number, limits chips, chart, calendar, Hosts, Programs, Breakdown.
- [ ] Segmented controls exist (Est. Cost/Tokens; Today/7/30; Models/Directories/Days).
- [ ] Heat map uses the 5-step ramp, today outlined, not-recorded hatched; tapping a day opens the day sheet.
- [ ] Limits sheet grouped by Host with the Claude Code switch and Accounts row.
- [ ] Wide layout shows the Host column with All Hosts selected by default; phone uses the scope menu.
- [ ] Pull to refresh; "Refreshing"/"Updated" subtitle; stale cards offer Refresh.
- [ ] Papel and AX variants hold (hero number wraps below its caption at AX sizes).
