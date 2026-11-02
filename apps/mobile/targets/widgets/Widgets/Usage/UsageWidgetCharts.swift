import Charts
import SwiftUI
import WidgetKit

/// One window: name, countdown, percentage, and its bar; an ended window
/// says its usage is unknown.
struct UsageWindowRow: View {
    let window: UsageWidgetSnapshot.Window
    let program: String
    let now: Date
    let showsCountdown: Bool
    var size: CGFloat = 12
    /// Rows in a grid all take the smaller name size, so a short row does
    /// not stand out among its neighbors.
    var smallNames = false

    var body: some View {
        let expired = window.isExpired(at: now)
        VStack(alignment: .leading, spacing: 4) {
            // A long name first takes a smaller size, then the countdown's
            // room at either size, before it is cut; the bar and the
            // percentage stay.
            ViewThatFits(in: .horizontal) {
                if !smallNames { heading(expired: expired, size: size, countdown: showsCountdown) }
                heading(expired: expired, size: size - 1.5, countdown: showsCountdown)
                if !smallNames { heading(expired: expired, size: size, countdown: false) }
                heading(expired: expired, size: size - 1.5, countdown: false)
            }
            if expired {
                Text(UsageWidgetText.windowReset)
                    .font(.system(size: 11)).foregroundStyle(.secondary)
                    .padding(.top, -2)
            } else {
                UsageBar(fraction: (window.usedPercent ?? 0) / 100, program: program)
            }
        }
        .lineLimit(1)
    }

    private func heading(expired: Bool, size: CGFloat, countdown: Bool) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 5) {
            Text(window.name).fontWeight(.medium)
                .font(.system(size: size))
            Spacer(minLength: 0)
            if !expired {
                if countdown, let reset = window.resetsAt {
                    Text(UsageWidgetText.countdown(to: reset, now: now))
                        .font(.system(size: size - 1).monospacedDigit())
                        .foregroundStyle(.secondary)
                }
                Text(UsageWidgetText.percent(window.usedPercent))
                    .font(.system(size: self.size, weight: .semibold).monospacedDigit())
            }
        }
    }
}

struct UsageBar: View {
    let fraction: Double
    let program: String
    @Environment(\.widgetRenderingMode) private var renderingMode

    var body: some View {
        Capsule()
            .fill(.primary.opacity(renderingMode == .fullColor ? 0.1 : 0.25))
            .overlay(alignment: .leading) {
                GeometryReader { proxy in
                    Capsule()
                        .fill(UsageWidgetColor.program(program, mode: renderingMode))
                        .frame(width: proxy.size.width * min(max(fraction, 0), 1))
                        .widgetAccentable()
                }
            }
            .frame(height: 4)
    }
}

/// The last seven days as stacked bars, today's at full strength.
struct UsageWeekBars: View {
    let scope: UsageWidgetScope
    let metric: AgentUsageMetric
    @Environment(\.widgetRenderingMode) private var renderingMode

    var body: some View {
        let dates = Array(scope.dates.suffix(7))
        let totals = dates.map { date in scope.programs.reduce(0) { $0 + ($1.days[date]?.value(metric) ?? 0) } }
        let maximum = max(totals.max() ?? 0, 1)
        GeometryReader { proxy in
            // The Lock Screen's strip is too narrow for gaps inside a bar.
            let narrow = proxy.size.width < 80
            HStack(alignment: .bottom, spacing: narrow ? 2 : 4) {
                ForEach(Array(dates.enumerated()), id: \.element) { index, date in
                    VStack(spacing: narrow ? 0 : 1) {
                        // Codex below Claude Code, as the charts stack them.
                        ForEach(scope.programs) { program in
                            let value = program.days[date]?.value(metric) ?? 0
                            if value > 0 {
                                RoundedRectangle(cornerRadius: 1.5)
                                    .fill(UsageWidgetColor.program(program.program, mode: renderingMode))
                                    .frame(height: max(proxy.size.height * value / maximum, 1.5))
                                    .widgetAccentable(program.program == "claude")
                            }
                        }
                        if totals[index] == 0 {
                            RoundedRectangle(cornerRadius: 1.5).fill(.secondary.opacity(0.4)).frame(height: 1.5)
                        }
                    }
                    .opacity(index == dates.count - 1 ? 1 : 0.4)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
                }
            }
        }
        .accessibilityHidden(true)
    }
}

/// Days as stacked areas, Codex below Claude Code, with a few gridlines.
struct UsageAreaChart: View {
    let scope: UsageWidgetScope
    let metric: AgentUsageMetric
    let dates: [String]
    /// A week's chart names its days; a month's dates three of them.
    let weekdays: Bool
    @Environment(\.locale) private var locale
    @Environment(\.widgetRenderingMode) private var renderingMode

    private struct Band: Identifiable {
        let program: String
        let index: Int
        let lower: Double
        let upper: Double
        var id: String { "\(program)\(index)" }
    }

    var body: some View {
        let bands = bands
        Chart {
            ForEach(bands) { band in
                AreaMark(
                    x: .value("Day", band.index), yStart: .value("Start", band.lower),
                    yEnd: .value("End", band.upper), series: .value("Program", band.program))
                    .interpolationMethod(.monotone)
                    .foregroundStyle(UsageWidgetColor.program(band.program, mode: renderingMode).opacity(0.16))
            }
            ForEach(bands) { band in
                LineMark(
                    x: .value("Day", band.index), y: .value("Value", band.upper),
                    series: .value("Program", band.program))
                    .interpolationMethod(.monotone)
                    .foregroundStyle(UsageWidgetColor.program(band.program, mode: renderingMode))
                    .lineStyle(StrokeStyle(
                        lineWidth: 1.5, lineJoin: .round,
                        dash: renderingMode != .fullColor && band.program != "claude" ? [3, 2] : []))
            }
        }
        .chartLegend(.hidden)
        .chartXScale(domain: 0...max(dates.count - 1, 1))
        .chartXAxis {
            AxisMarks(values: xTicks) { value in
                AxisValueLabel(anchor: anchor(value.as(Int.self))) {
                    if let index = value.as(Int.self), dates.indices.contains(index) {
                        Text(UsageWidgetText.day(dates[index], weekday: weekdays, locale: locale))
                    }
                }
                .font(.system(size: 10))
            }
        }
        .chartYAxis {
            AxisMarks(position: .trailing, values: .automatic(desiredCount: 3)) { value in
                AxisGridLine(stroke: StrokeStyle(lineWidth: 0.5))
                AxisValueLabel {
                    if let amount = value.as(Double.self) {
                        Text(UsageWidgetText.axis(amount, metric: metric, locale: locale))
                    }
                }
                .font(.system(size: 10))
            }
        }
        .accessibilityHidden(true)
    }

    /// Stacked bottom up in reverse program order: Codex below Claude Code.
    private var bands: [Band] {
        var bands: [Band] = []
        for (index, date) in dates.enumerated() {
            var lower = 0.0
            for program in scope.programs.reversed() {
                let value = program.days[date]?.value(metric) ?? 0
                bands.append(Band(program: program.program, index: index, lower: lower, upper: lower + value))
                lower += value
            }
        }
        return bands
    }

    private var xTicks: [Int] {
        guard dates.count > 1 else { return [0] }
        if weekdays { return Array(dates.indices) }
        return [0, (dates.count - 1) / 2, dates.count - 1]
    }

    /// Edge labels hug the plot so the chart keeps them.
    private func anchor(_ index: Int?) -> UnitPoint {
        if dates.count <= 1 { return .top }
        if index == 0 { return .topLeading }
        if index == dates.count - 1 { return .topTrailing }
        return .top
    }
}

/// Program colors, kept apart by weight when a tinted Home Screen drops
/// them to one accent.
enum UsageWidgetColor {
    static func program(_ program: String, mode: WidgetRenderingMode) -> Color {
        guard mode == .fullColor else { return program == "claude" ? .primary : .primary.opacity(0.55) }
        return AgentUsageStyle.color(for: program)
    }
}
