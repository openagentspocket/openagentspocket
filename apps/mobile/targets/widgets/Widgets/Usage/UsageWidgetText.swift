import SwiftUI

// MARK: Copy

enum UsageWidgetText {
    static var windowReset: String { String(localized: "Reset · usage unknown") }

    /// After an hour a reading reads as stale.
    static let staleAfter: TimeInterval = 3_600

    static func isStale(_ readAt: Date, now: Date) -> Bool {
        now.timeIntervalSince(readAt) >= staleAfter
    }

    /// "Updated 5:38 PM", or the day for an older reading.
    static func updated(_ readAt: Date, now: Date) -> String {
        Calendar.current.isDate(readAt, inSameDayAs: now)
            ? String(localized: "Updated \(readAt.formatted(date: .omitted, time: .shortened))")
            : String(localized: "Updated \(readAt.formatted(.dateTime.month(.abbreviated).day()))")
    }

    static func range(_ range: AgentUsageRange) -> String {
        switch range {
        case .today: String(localized: "Today")
        case .last7Days: String(localized: "Last 7 days")
        case .last30Days: String(localized: "Last 30 days")
        }
    }

    static func rangeShort(_ range: AgentUsageRange) -> String {
        switch range {
        case .today: String(localized: "Today")
        case .last7Days: String(localized: "7 days")
        case .last30Days: String(localized: "30 days")
        }
    }

    /// A Lock Screen figure with its range: "$12 today".
    static func inlineReading(_ figure: String, range: AgentUsageRange) -> String {
        switch range {
        case .today: String(localized: "\(figure) today")
        case .last7Days: String(localized: "\(figure) last 7 days")
        case .last30Days: String(localized: "\(figure) last 30 days")
        }
    }

    static func cost(_ value: Double?, locale: Locale) -> String {
        AgentUsageStyle.cost(value, locale: locale)
    }

    static func tokens(_ value: Int64, locale: Locale) -> String {
        String(localized: "\(AgentUsageStyle.tokens(value, locale: locale)) tokens")
    }

    static func value(_ summary: UsageWidgetSnapshot.Summary, metric: AgentUsageMetric, locale: Locale) -> String {
        switch metric {
        case .cost: AgentUsageStyle.cost(summary.cost, locale: locale)
        case .tokens: AgentUsageStyle.tokens(summary.tokens, locale: locale)
        }
    }

    /// A Lock Screen figure: whole dollars past $1,000.
    static func short(_ summary: UsageWidgetSnapshot.Summary, metric: AgentUsageMetric, locale: Locale) -> String {
        switch metric {
        case .cost: AgentUsageStyle.shortCost(summary.cost, locale: locale)
        case .tokens: AgentUsageStyle.tokens(summary.tokens, locale: locale)
        }
    }

    static func axis(_ value: Double, metric: AgentUsageMetric, locale: Locale) -> String {
        switch metric {
        // Compact, so thousands do not squeeze the plot: "$2K".
        case .cost:
            value.formatted(
                .currency(code: "USD").notation(.compactName).precision(.significantDigits(1...2)).locale(locale))
        case .tokens:
            AgentUsageStyle.tokens(Int64(value), locale: locale)
        }
    }

    static func percent(_ value: Double?) -> String {
        guard let value else { return "–" }
        return (value / 100).formatted(.percent.precision(.fractionLength(0)))
    }

    static func countdown(to reset: Date, now: Date) -> String {
        AgentUsageStyle.countdown(to: reset, now: now, locale: .current)
    }

    /// "resets in 1h 48m · 7:26 PM", the day added when it is not today.
    static func resetLine(_ window: UsageWidgetSnapshot.Window, now: Date) -> String {
        guard let reset = window.resetsAt else { return window.isExpired(at: now) ? windowReset : "" }
        if window.isExpired(at: now) { return windowReset }
        let remaining = countdown(to: reset, now: now)
        let at = clock(reset, now: now)
        return String(localized: "resets in \(remaining) · \(at)")
    }

    /// "resets 7:26 PM", or "resets Oct 30" when it is not today, beside a
    /// countdown that gives the rest; nil once the window has ended.
    static func resetDay(_ window: UsageWidgetSnapshot.Window, now: Date) -> String? {
        guard let reset = window.resetsAt, !window.isExpired(at: now) else { return nil }
        let when = Calendar.current.isDate(reset, inSameDayAs: now)
            ? reset.formatted(date: .omitted, time: .shortened)
            : reset.formatted(.dateTime.month(.abbreviated).day())
        return String(localized: "resets \(when)")
    }

    /// Where a program's windows came from, as clock times that a widget
    /// does not have to keep redrawing.
    static func source(_ limits: UsageWidgetSnapshot.Limits) -> String? {
        guard let observed = limits.observedAt else { return nil }
        let time = observed.formatted(date: .omitted, time: .shortened)
        if limits.isLastReading { return String(localized: "Last reading · as of \(time)") }
        switch limits.source {
        case .lastSession: return String(localized: "Last session · as of \(time)")
        case .program:
            let name = limits.name
            return String(localized: "From \(name) · as of \(time)")
        case nil: return nil
        }
    }

    /// A medium widget's foot: only a reading that is not the program's
    /// own current answer is called out.
    static func shortSource(_ limits: UsageWidgetSnapshot.Limits, now: Date) -> String? {
        guard let observed = limits.observedAt else { return nil }
        let time = clock(observed, now: now)
        if limits.isLastReading { return String(localized: "Last reading · \(time)") }
        return limits.source == .lastSession ? String(localized: "Last session · \(time)") : nil
    }

    static func clock(_ date: Date, now: Date) -> String {
        Calendar.current.isDate(date, inSameDayAs: now)
            ? date.formatted(date: .omitted, time: .shortened)
            : date.formatted(.dateTime.month(.abbreviated).day().hour().minute())
    }

    /// A chart's `YYYY-MM-DD` day, read in UTC so it never shifts again.
    static func day(_ day: String, weekday: Bool, locale: Locale) -> String {
        let parts = day.split(separator: "-").compactMap { Int($0) }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .gmt
        guard parts.count == 3,
            let date = calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
        else { return day }
        let style = Date.FormatStyle(locale: locale, calendar: calendar, timeZone: .gmt)
        return weekday
            ? date.formatted(style.weekday(.abbreviated))
            : date.formatted(style.month(.abbreviated).day())
    }
}
