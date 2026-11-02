import SwiftUI
import WidgetKit

// Widget views double-included in the app target, whose tests render them;
// the widgets, their intents and timelines stay extension-only.

/// One moment of a Usage widget.
struct UsageWidgetEntry: TimelineEntry {
    let date: Date
    let snapshot: UsageWidgetSnapshot?
    /// nil reads All Hosts.
    let hostID: UUID?
    let metric: AgentUsageMetric
    let range: AgentUsageRange
}

/// One moment of a Usage Limits widget.
struct UsageLimitsWidgetEntry: TimelineEntry {
    let date: Date
    let snapshot: UsageWidgetSnapshot?
    /// nil picks the first Host that reported Usage Limits.
    let hostID: UUID?
    /// The program small and Lock Screen sizes show, nil for the one
    /// closest to its limit; medium and large show every program. Claude
    /// Code shows each of its Accounts, while the Host has several.
    let program: String?
}

// MARK: Usage

struct UsageWidgetView: View {
    let entry: UsageWidgetEntry
    let family: WidgetFamily
    @Environment(\.locale) private var locale

    var body: some View {
        content
            .widgetURL(UsageWidgetLink.usageURL(hostID: scope?.hostID))
    }

    /// The chosen Host, or All Hosts once that Host leaves the catalog.
    private var scope: UsageWidgetScope? {
        guard let snapshot = entry.snapshot else { return nil }
        return UsageWidgetScope(snapshot: snapshot, hostID: entry.hostID)
            ?? UsageWidgetScope(snapshot: snapshot, hostID: nil)
    }

    @ViewBuilder
    private var content: some View {
        if let scope, !scope.isEmpty {
            switch family {
            case .systemMedium: medium(scope)
            case .systemLarge, .systemExtraLarge: large(scope)
            case .accessoryCircular: circular(scope)
            case .accessoryRectangular: rectangular(scope)
            case .accessoryInline: inline(scope)
            default: small(scope)
            }
        } else {
            UsageWidgetMessage(
                family: family, symbol: symbol(scope), title: header(scope),
                message: message(scope))
        }
    }

    // MARK: Home Screen

    private func small(_ scope: UsageWidgetScope) -> some View {
        let total = scope.total(entry.range)
        return VStack(alignment: .leading, spacing: 0) {
            UsageWidgetHeader(title: UsageWidgetText.range(entry.range), detail: scope.title)
            UsageFigure(summary: total, metric: entry.metric, size: 30)
                .padding(.top, 5)
            Text(metricName)
                .font(.caption).foregroundStyle(.secondary)
            if entry.metric == .cost {
                Text(UsageWidgetText.tokens(total.tokens, locale: locale))
                    .font(.caption).foregroundStyle(.secondary)
            }
            Spacer(minLength: 6)
            UsageWeekBars(scope: scope, metric: entry.metric)
                .frame(height: 26)
            UsageWidgetUpdated(readAt: scope.updatedAt, now: entry.date)
                .padding(.top, 5)
        }
        .lineLimit(1)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private func medium(_ scope: UsageWidgetScope) -> some View {
        let total = scope.total(entry.range)
        return VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                UsageWidgetHeader(title: UsageWidgetText.range(entry.range), detail: scope.title)
                Spacer(minLength: 8)
                UsageWidgetUpdated(readAt: scope.updatedAt, now: entry.date)
            }
            HStack(alignment: .top, spacing: 14) {
                VStack(alignment: .leading, spacing: 0) {
                    UsageFigure(summary: total, metric: entry.metric, size: 30)
                    Text(metricName)
                        .font(.caption).foregroundStyle(.secondary)
                    if entry.metric == .cost {
                        Text(UsageWidgetText.tokens(total.tokens, locale: locale))
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 4)
                    VStack(alignment: .leading, spacing: 2) {
                        ForEach(scope.programs) { program in
                            UsageProgramRow(
                                program: program.program, name: program.name,
                                value: UsageWidgetText.value(program.summary(entry.range), metric: entry.metric, locale: locale))
                                .font(.caption)
                        }
                    }
                }
                .frame(width: 160, alignment: .leading)
                UsageAreaChart(scope: scope, metric: entry.metric, dates: scope.chartDates(entry.range), weekdays: false)
            }
        }
        .lineLimit(1)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private func large(_ scope: UsageWidgetScope) -> some View {
        let total = scope.total(entry.range)
        let dates = scope.chartDates(entry.range)
        return VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                UsageWidgetHeader(title: UsageWidgetText.range(entry.range), detail: scope.title)
                Spacer(minLength: 8)
                UsageWidgetUpdated(readAt: scope.updatedAt, now: entry.date)
            }
            UsageFigure(summary: total, metric: entry.metric, size: 36)
                .padding(.top, 6)
            Text(entry.metric == .cost
                ? String(localized: "\(metricName) · \(UsageWidgetText.tokens(total.tokens, locale: locale))")
                : String(localized: "\(metricName) · \(UsageWidgetText.cost(total.cost, locale: locale)) est."))
                .font(.footnote).foregroundStyle(.secondary)
            // The chart takes whatever the rows leave, so one Host's two
            // rows do not leave the bottom empty.
            UsageAreaChart(scope: scope, metric: entry.metric, dates: dates, weekdays: dates.count <= 7)
                .frame(minHeight: 104, maxHeight: .infinity)
                .padding(.top, 12)
            VStack(alignment: .leading, spacing: 0) {
                ForEach(scope.programs) { program in
                    UsageTableRow(
                        leading: { UsageProgramDot(program: program.program) },
                        name: program.name, summary: program.summary(entry.range), metric: entry.metric)
                }
                if scope.hostID == nil {
                    Divider().padding(.leading, 16).padding(.vertical, 6)
                    ForEach(scope.included) { host in
                        Link(destination: UsageWidgetLink.usageURL(hostID: host.id) ?? URL(fileURLWithPath: "/")) {
                            UsageTableRow(
                                leading: {
                                    Image(systemName: "desktopcomputer")
                                        .font(.system(size: 9))
                                        .foregroundStyle(.secondary)
                                },
                                name: host.name,
                                summary: .sum(host.programs.map { $0.summary(entry.range) }),
                                metric: entry.metric)
                        }
                        .buttonStyle(.plain)
                    }
                    if let note = scope.excludedNote {
                        Text(note)
                            .font(.caption).foregroundStyle(.secondary)
                            .padding(.leading, 16).padding(.top, 4)
                    }
                }
            }
            .padding(.top, 12)
        }
        .lineLimit(1)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    // MARK: Lock Screen

    private func circular(_ scope: UsageWidgetScope) -> some View {
        let total = scope.total(entry.range)
        return ZStack {
            AccessoryWidgetBackground()
            VStack(spacing: 0) {
                Image(systemName: "chart.bar.fill")
                    .font(.system(size: 10, weight: .semibold))
                Text(UsageWidgetText.short(total, metric: entry.metric, locale: locale))
                    .font(.system(size: 15, weight: .semibold).monospacedDigit())
                    .minimumScaleFactor(0.6)
                Text(UsageWidgetText.rangeShort(entry.range))
                    .font(.system(size: 10))
                    .foregroundStyle(.secondary)
            }
            .lineLimit(1)
            .padding(.horizontal, 6)
        }
    }

    private func rectangular(_ scope: UsageWidgetScope) -> some View {
        let total = scope.total(entry.range)
        return VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 4) {
                Image(systemName: "chart.bar.fill")
                Text(UsageWidgetText.range(entry.range)).fontWeight(.semibold)
                Text("· \(scope.title)").foregroundStyle(.secondary)
            }
            .font(.system(size: 13))
            HStack(alignment: .bottom, spacing: 8) {
                VStack(alignment: .leading, spacing: 0) {
                    UsageFigure(summary: total, metric: entry.metric, size: 22)
                    Text(entry.metric == .cost
                        ? UsageWidgetText.tokens(total.tokens, locale: locale)
                        : String(localized: "\(UsageWidgetText.cost(total.cost, locale: locale)) est."))
                        .font(.system(size: 12)).foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
                UsageWeekBars(scope: scope, metric: entry.metric)
                    .frame(width: 56, height: 20)
                    .padding(.bottom, 4)
            }
        }
        .lineLimit(1)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// Shares its line with the date, which leaves no room for "All Hosts";
    /// only a chosen Host is named, after the figure, so the tail is cut.
    private func inline(_ scope: UsageWidgetScope) -> some View {
        let total = scope.total(entry.range)
        let reading = UsageWidgetText.inlineReading(
            UsageWidgetText.short(total, metric: entry.metric, locale: locale), range: entry.range)
        return Label(
            scope.hostID == nil ? reading : "\(reading) · \(scope.title)",
            systemImage: "chart.bar.fill")
    }

    // MARK: States

    private var metricName: String {
        entry.metric == .cost ? String(localized: "Estimated API cost") : String(localized: "Token Usage")
    }

    private func header(_ scope: UsageWidgetScope?) -> (String, String?) {
        guard let scope else { return (String(localized: "Usage"), nil) }
        return (UsageWidgetText.range(entry.range), scope.title)
    }

    private func symbol(_ scope: UsageWidgetScope?) -> String {
        guard let scope, let host = scope.excluded.first else { return "chart.bar.fill" }
        return host.exclusion == .notConnected ? "wifi.slash" : "desktopcomputer"
    }

    private func message(_ scope: UsageWidgetScope?) -> String {
        guard let scope else { return String(localized: "Open Agentico to load Usage.") }
        if scope.hostID != nil, let host = scope.excluded.first, let reason = host.excludedText {
            return host.exclusion == .notReadYet ? String(localized: "Open Agentico to load Usage.") : reason
        }
        return String(localized: "Open Agentico to load Usage.")
    }
}
