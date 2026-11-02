import SwiftUI
import WidgetKit

// MARK: Usage Limits

struct UsageLimitsWidgetView: View {
    let entry: UsageLimitsWidgetEntry
    let family: WidgetFamily

    var body: some View {
        content
            .widgetURL(host.flatMap { UsageWidgetLink.limitsURL(hostID: $0.id) } ?? UsageWidgetLink.usageURL(hostID: nil))
    }

    /// The chosen Host, or the first one with Usage Limits.
    private var host: UsageWidgetSnapshot.Host? {
        guard let snapshot = entry.snapshot else { return nil }
        if let hostID = entry.hostID { return snapshot.host(hostID) }
        return snapshot.hosts.first { !$0.limits.isEmpty } ?? snapshot.hosts.first
    }

    @ViewBuilder
    private var content: some View {
        if let host, host.reports {
            switch family {
            case .systemMedium: medium(host)
            case .systemLarge, .systemExtraLarge: large(host)
            case .accessoryCircular: circular(host)
            case .accessoryRectangular: rectangular(host)
            case .accessoryInline: inline(host)
            default: small(host)
            }
        } else {
            UsageWidgetMessage(
                family: family,
                symbol: host?.exclusion == .notConnected ? "wifi.slash" : "gauge.with.dots.needle.50percent",
                title: (host?.name ?? String(localized: "Usage Limits"), nil),
                message: host.flatMap { $0.exclusion == .notReadYet ? nil : $0.excludedText }
                    ?? String(localized: "Open Agentico to read Usage Limits."))
        }
    }

    /// The chosen program's entries: its own, or each Claude Code Account's.
    private func programEntries(_ host: UsageWidgetSnapshot.Host) -> [UsageWidgetSnapshot.Limits] {
        UsageLimitsPick.entries(host.limits, preferring: entry.program, now: now)
    }

    private var now: Date { entry.date }

    // MARK: Home Screen

    @ViewBuilder
    private func small(_ host: UsageWidgetSnapshot.Host) -> some View {
        let entries = programEntries(host)
        if UsageLimitsLayout.program(entries) == .lines, let first = entries.first {
            // Each Account's tightest window; countdowns would not fit.
            VStack(alignment: .leading, spacing: 0) {
                UsageProgramTitle(program: first.program, name: first.name)
                Text(host.name)
                    .font(.caption).foregroundStyle(.secondary)
                    .padding(.top, 1)
                Spacer(minLength: 4)
                UsageAccountLines(entries: entries, now: now, barWidths: (26, 16), spacing: 5)
            }
            .lineLimit(1)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        } else {
            smallFigure(host, limits: entries.first)
        }
    }

    @ViewBuilder
    private func smallFigure(_ host: UsageWidgetSnapshot.Host, limits: UsageWidgetSnapshot.Limits?) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            UsageProgramTitle(program: limits?.program ?? entry.program ?? "", name: limits?.name ?? programName)
            Text(host.name)
                .font(.caption).foregroundStyle(.secondary)
                .padding(.top, 1)
            Spacer(minLength: 4)
            if let limits, let window = UsageLimitsPick.tightest(limits.windows, now: now) {
                if window.isExpired(at: now) {
                    Text(window.name).font(.footnote.weight(.medium))
                    Text(UsageWidgetText.windowReset)
                        .font(.caption).foregroundStyle(.secondary)
                        .padding(.top, 2)
                } else {
                    Text(UsageWidgetText.percent(window.usedPercent))
                        .font(.system(size: 34, weight: .semibold).monospacedDigit())
                    Text(window.name).font(.footnote.weight(.medium))
                    UsageBar(fraction: (window.usedPercent ?? 0) / 100, program: limits.program)
                        .padding(.top, 8)
                    if let reset = window.resetsAt {
                        Text("resets in \(UsageWidgetText.countdown(to: reset, now: now))")
                            .font(.caption).foregroundStyle(.secondary)
                            .padding(.top, 6)
                    }
                }
            } else {
                Text(limits?.message ?? String(localized: "No Usage Limits reported."))
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(3)
            }
        }
        .lineLimit(1)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    @ViewBuilder
    private func medium(_ host: UsageWidgetSnapshot.Host) -> some View {
        if UsageLimitsLayout.medium(host.limits) == .lines {
            VStack(alignment: .leading, spacing: 0) {
                mediumHeader(host)
                UsageLimitsLines(entries: host.limits, now: now)
                    .padding(.top, 8)
                    .frame(maxHeight: .infinity, alignment: .top)
            }
            .lineLimit(1)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        } else {
            mediumColumns(host)
        }
    }

    private func mediumHeader(_ host: UsageWidgetSnapshot.Host) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(host.name).font(.footnote.weight(.semibold))
            Spacer(minLength: 8)
            UsageWidgetUpdated(readAt: host.readAt, now: now)
        }
    }

    private func mediumColumns(_ host: UsageWidgetSnapshot.Host) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            mediumHeader(host)
            HStack(alignment: .top, spacing: 12) {
                ForEach(host.limits.prefix(2)) { limits in
                    VStack(alignment: .leading, spacing: 0) {
                        // Both columns are Accounts or neither, so their
                        // titles share a size.
                        UsageProgramTitle(
                            program: limits.program, name: limits.name, account: limits.account,
                            size: limits.account == nil ? 13 : 11)
                        if let message = limits.message {
                            Text(message)
                                .font(.footnote.weight(.medium)).foregroundStyle(.secondary)
                                .lineLimit(3)
                                .padding(.top, 8)
                        }
                        ForEach(limits.windows.prefix(3)) { window in
                            UsageWindowRow(window: window, program: limits.program, now: now, showsCountdown: true)
                                .padding(.top, 9)
                        }
                        Spacer(minLength: 0)
                        if let source = UsageWidgetText.shortSource(limits, now: now) {
                            Text(source).font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding(.top, 10)
        }
        .lineLimit(1)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    @ViewBuilder
    private func large(_ host: UsageWidgetSnapshot.Host) -> some View {
        let layout = UsageLimitsLayout.large(host.limits)
        if layout == .pairs || host.limits.contains(where: { $0.account != nil }) {
            VStack(alignment: .leading, spacing: 0) {
                largeHeader(host)
                UsageLimitsStack(entries: host.limits, now: now, layout: layout)
                    .frame(maxHeight: .infinity, alignment: .top)
            }
            .lineLimit(1)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        } else {
            largePrograms(host)
        }
    }

    private func largeHeader(_ host: UsageWidgetSnapshot.Host) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(host.name).font(.subheadline.weight(.semibold))
            Spacer(minLength: 8)
            UsageWidgetUpdated(readAt: host.readAt, now: now)
        }
    }

    private func largePrograms(_ host: UsageWidgetSnapshot.Host) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            largeHeader(host)
            ForEach(Array(host.limits.prefix(3).enumerated()), id: \.element.id) { index, limits in
                if index > 0 { Divider().padding(.top, 9) }
                UsageProgramTitle(program: limits.program, name: limits.name, size: 15)
                    .padding(.top, 9)
                if let message = limits.message {
                    Text(message)
                        .font(.footnote).foregroundStyle(.secondary)
                        .lineLimit(2)
                        .padding(.top, 6)
                }
                ForEach(limits.windows.prefix(4)) { window in
                    VStack(alignment: .leading, spacing: 0) {
                        UsageWindowRow(window: window, program: limits.program, now: now, showsCountdown: false, size: 13)
                        Text(UsageWidgetText.resetLine(window, now: now))
                            .font(.caption2).foregroundStyle(.secondary)
                            .padding(.top, 3)
                    }
                    .padding(.top, 6)
                }
                if let source = UsageWidgetText.source(limits) {
                    Text(source)
                        .font(.caption2).foregroundStyle(.secondary)
                        .padding(.top, 5)
                }
            }
            Spacer(minLength: 0)
        }
        .lineLimit(1)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    // MARK: Lock Screen

    @ViewBuilder
    private func circular(_ host: UsageWidgetSnapshot.Host) -> some View {
        if let reading = UsageLimitsPick.reading(programEntries(host), now: now) {
            let window = reading.window
            Gauge(value: min(max((window.usedPercent ?? 0) / 100, 0), 1)) {
                Text(reading.limits.account.map { "\($0) · \(window.name)" } ?? window.name)
            } currentValueLabel: {
                // Named, since the ring alone does not say which window it is.
                if let account = reading.limits.account {
                    VStack(spacing: 0) {
                        Text(account)
                            .font(.system(size: 8, weight: .medium))
                            .truncationMode(.middle)
                        Text(UsageWidgetText.percent(window.usedPercent))
                            .font(.system(size: 15, weight: .semibold))
                            .monospacedDigit()
                        Text(window.name)
                            .font(.system(size: 7))
                            .foregroundStyle(.secondary)
                    }
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .padding(.horizontal, 4)
                } else {
                    VStack(spacing: 0) {
                        Text(window.name)
                            .font(.system(size: 9, weight: .medium))
                            .lineLimit(1)
                            .minimumScaleFactor(0.6)
                        Text(UsageWidgetText.percent(window.usedPercent))
                            .font(.system(size: 17, weight: .semibold))
                            .monospacedDigit()
                    }
                    .padding(.horizontal, 4)
                }
            }
            .gaugeStyle(.accessoryCircularCapacity)
        } else {
            ZStack {
                AccessoryWidgetBackground()
                Image(systemName: "gauge.with.dots.needle.0percent")
                    .font(.title3)
            }
        }
    }

    @ViewBuilder
    private func rectangular(_ host: UsageWidgetSnapshot.Host) -> some View {
        let entries = programEntries(host)
        if UsageLimitsLayout.program(entries) == .lines, let first = entries.first {
            VStack(alignment: .leading, spacing: 1) {
                Text("\(Text(first.name).fontWeight(.semibold)) \(Text("· \(host.name)").foregroundStyle(.secondary))")
                    .font(.system(size: 13))
                // The three it holds, in the app's order.
                UsageAccountLines(
                    entries: Array(entries.prefix(3)), now: now, size: 13, barWidths: (44, 30), spacing: 1)
            }
            .lineLimit(1)
            .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            rectangularWindows(host, limits: entries.first)
        }
    }

    private func rectangularWindows(
        _ host: UsageWidgetSnapshot.Host, limits: UsageWidgetSnapshot.Limits?
    ) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            // The program first: Automatic can change it between readings.
            Text("\(Text(limits?.name ?? programName).fontWeight(.semibold)) \(Text("· \(host.name)").foregroundStyle(.secondary))")
                .font(.system(size: 13))
            if let limits, !limits.windows.isEmpty {
                ForEach(UsageLimitsPick.lockScreen(limits.windows, now: now)) { window in
                    UsageWindowRow(window: window, program: limits.program, now: now, showsCountdown: true, size: 13)
                }
            } else {
                Text(limits?.message ?? String(localized: "No Usage Limits reported."))
                    .font(.system(size: 12)).foregroundStyle(.secondary)
                    .lineLimit(2)
            }
        }
        .lineLimit(1)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// The reading first: a long Host name is what the date's line cuts.
    private func inline(_ host: UsageWidgetSnapshot.Host) -> some View {
        let reading = UsageLimitsPick.reading(programEntries(host), now: now).map { reading in
            let figure = "\(reading.window.name) \(UsageWidgetText.percent(reading.window.usedPercent))"
            return reading.limits.account.map { "\($0) \(figure)" } ?? figure
        } ?? String(localized: "Usage Limits")
        return Label("\(reading) · \(host.name)", systemImage: "gauge.with.dots.needle.50percent")
    }

    private var programName: String {
        switch entry.program {
        case "claude": "Claude Code"
        case "codex": "Codex"
        case let program?: program
        case nil: String(localized: "Usage Limits")
        }
    }
}
