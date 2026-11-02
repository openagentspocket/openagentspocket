import SwiftUI
import WidgetKit

/// How a size lays out a Host's entries, Codex and each Claude Code Account
/// counting as one. A Host without Accounts keeps the layouts it had.
enum UsageLimitsLayout: Equatable {
    /// One program: the small size's big figure, the Lock Screen's windows.
    case figure
    /// One line per entry.
    case lines
    /// The medium size's columns, three windows each.
    case columns
    /// Up to four windows per entry.
    case windows
    /// Two windows per entry, side by side.
    case pairs

    /// The small and rectangular sizes, over the chosen program's entries.
    static func program(_ entries: [UsageWidgetSnapshot.Limits]) -> Self {
        entries.count > 1 ? .lines : .figure
    }

    static func medium(_ entries: [UsageWidgetSnapshot.Limits]) -> Self {
        entries.count > 2 ? .lines : .columns
    }

    static func large(_ entries: [UsageWidgetSnapshot.Limits]) -> Self {
        entries.count > 3 ? .pairs : .windows
    }
}

/// Which windows a size with room for one or two shows.
enum UsageLimitsPick {
    /// The chosen program, or with none chosen the one whose running window
    /// is closest to its limit, so a program with its limits off is not the
    /// default.
    static func program(
        _ limits: [UsageWidgetSnapshot.Limits], preferring program: String?, now: Date
    ) -> UsageWidgetSnapshot.Limits? {
        if let program { return limits.first { $0.program == program } ?? limits.first }
        let reporting = limits.filter { tightest($0.windows, now: now) != nil }
        return reporting.max {
            (tightest($0.windows, now: now)?.usedPercent ?? 0) < (tightest($1.windows, now: now)?.usedPercent ?? 0)
        } ?? limits.first
    }

    /// Every entry of that program: its own, or each Claude Code Account's.
    static func entries(
        _ limits: [UsageWidgetSnapshot.Limits], preferring program: String?, now: Date
    ) -> [UsageWidgetSnapshot.Limits] {
        guard let chosen = self.program(limits, preferring: program, now: now)?.program else { return [] }
        return limits.filter { $0.program == chosen }
    }

    /// The one reading the circular and inline sizes hold: a program's
    /// soonest window, or with several Accounts the running window closest
    /// to its limit, so the Account it names is the one to watch.
    static func reading(
        _ entries: [UsageWidgetSnapshot.Limits], now: Date
    ) -> (limits: UsageWidgetSnapshot.Limits, window: UsageWidgetSnapshot.Window)? {
        if entries.count > 1 {
            let closest = entries.compactMap { limits in
                running(limits.windows, now: now).max(by: lessUsed).map { (limits: limits, window: $0) }
            }
            .max { lessUsed($0.window, $1.window) }
            if let closest { return closest }
        }
        return entries.lazy.compactMap { limits in
            shortest(limits.windows, now: now).map { (limits: limits, window: $0) }
        }.first
    }

    /// The most used window still running; an ended window only when no
    /// other is left.
    static func tightest(_ windows: [UsageWidgetSnapshot.Window], now: Date) -> UsageWidgetSnapshot.Window? {
        running(windows, now: now).max(by: lessUsed) ?? windows.first
    }

    /// The window that resets soonest, the one an agent runs into first.
    static func shortest(_ windows: [UsageWidgetSnapshot.Window], now: Date) -> UsageWidgetSnapshot.Window? {
        running(windows, now: now).min { ($0.resetsAt ?? .distantFuture) < ($1.resetsAt ?? .distantFuture) }
            ?? windows.first
    }

    private static func running(_ windows: [UsageWidgetSnapshot.Window], now: Date) -> [UsageWidgetSnapshot.Window] {
        windows.filter { !$0.isExpired(at: now) && $0.usedPercent != nil }
    }

    private static func lessUsed(_ lhs: UsageWidgetSnapshot.Window, _ rhs: UsageWidgetSnapshot.Window) -> Bool {
        (lhs.usedPercent ?? 0) < (rhs.usedPercent ?? 0)
    }

    /// The soonest window, then the most used of the rest.
    static func lockScreen(_ windows: [UsageWidgetSnapshot.Window], now: Date) -> [UsageWidgetSnapshot.Window] {
        guard let first = shortest(windows, now: now) else { return [] }
        let rest = windows.filter { $0.id != first.id }
        return [first] + (tightest(rest, now: now).map { [$0] } ?? [])
    }
}
