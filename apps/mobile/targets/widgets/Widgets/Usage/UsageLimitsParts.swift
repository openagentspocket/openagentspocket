import SwiftUI
import WidgetKit

/// An entry's name, "Claude Code" under an Account's while there is room,
/// beside its two windows or why it has none.
struct UsageLimitsLine: View {
    let limits: UsageWidgetSnapshot.Limits
    let now: Date
    let showsProgram: Bool
    let size: CGFloat

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 5) {
                    UsageProgramDot(program: limits.program)
                    Text(limits.account ?? limits.name)
                        .font(.system(size: size, weight: .semibold))
                        .truncationMode(.middle)
                }
                if showsProgram && limits.account != nil {
                    Text(limits.name)
                        .font(.system(size: size - 3))
                        .foregroundStyle(.secondary)
                        .padding(.leading, 13)
                }
            }
            .frame(width: 70, alignment: .leading)
            if limits.windows.isEmpty {
                // As tall as a window's row, so the lines stay evenly spaced.
                VStack(alignment: .leading, spacing: 4) {
                    Text(limits.message ?? String(localized: "No Usage Limits reported."))
                        .font(.system(size: size - 1))
                        .foregroundStyle(.secondary)
                    Color.clear.frame(height: 4)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                windows
            }
        }
        .lineLimit(1)
    }

    private var windows: some View {
        let shown = UsageLimitsPick.lockScreen(limits.windows, now: now)
        return ForEach(0..<2, id: \.self) { index in
            if shown.indices.contains(index) {
                UsageWindowRow(
                    window: shown[index], program: limits.program, now: now, showsCountdown: true, size: size - 1,
                    smallNames: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                Color.clear.frame(maxWidth: .infinity, maxHeight: 0)
            }
        }
    }
}

/// A large widget's entries once a Host has Claude Code Accounts: up to
/// three keep four windows each with their countdowns inline; more, or
/// what does not fit, take two windows each side by side.
struct UsageLimitsStack: View {
    let entries: [UsageWidgetSnapshot.Limits]
    let now: Date
    let layout: UsageLimitsLayout

    var body: some View {
        ViewThatFits(in: .vertical) {
            if layout == .windows { stack(.windows) }
            stack(.pairs(resets: true))
            stack(.pairs(resets: false))
        }
    }

    private func stack(_ style: UsageLimitsEntry.Style) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(entries.enumerated()), id: \.element.id) { index, limits in
                if index > 0 { Divider().padding(.top, style == .windows ? 8 : 7) }
                UsageLimitsEntry(limits: limits, now: now, style: style)
            }
        }
    }
}

/// One entry of a large widget: its title, then its windows.
struct UsageLimitsEntry: View {
    enum Style: Equatable {
        /// Up to four, one per row.
        case windows
        /// The soonest and the most used of the rest, side by side, with
        /// when each resets while there is room.
        case pairs(resets: Bool)
    }

    let limits: UsageWidgetSnapshot.Limits
    let now: Date
    let style: Style

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                UsageProgramTitle(program: limits.program, name: limits.name, account: limits.account, size: 14)
                Spacer(minLength: 0)
                if let source = UsageWidgetText.shortSource(limits, now: now) {
                    Text(source).font(.caption2).foregroundStyle(.secondary)
                }
            }
            .padding(.top, style == .windows ? 8 : 7)
            if let message = limits.message {
                Text(message)
                    .font(.footnote).foregroundStyle(.secondary)
                    .lineLimit(style == .windows ? 2 : 1)
                    .padding(.top, 4)
            }
            switch style {
            case .windows:
                ForEach(limits.windows.prefix(4)) { window in
                    UsageWindowRow(window: window, program: limits.program, now: now, showsCountdown: true, size: 13)
                        .padding(.top, 5)
                }
            case .pairs(let resets):
                if !limits.windows.isEmpty { pairs(resets: resets).padding(.top, 5) }
            }
        }
    }

    private func pairs(resets: Bool) -> some View {
        let shown = UsageLimitsPick.lockScreen(limits.windows, now: now)
        return HStack(alignment: .top, spacing: 14) {
            ForEach(0..<2, id: \.self) { index in
                if shown.indices.contains(index) {
                    VStack(alignment: .leading, spacing: 3) {
                        UsageWindowRow(
                            window: shown[index], program: limits.program, now: now, showsCountdown: true, size: 12)
                        if resets, let reset = UsageWidgetText.resetDay(shown[index], now: now) {
                            Text(reset).font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                } else {
                    Color.clear.frame(maxWidth: .infinity, maxHeight: 0)
                }
            }
        }
    }
}

struct UsageProgramRow: View {
    let program: String
    let name: String
    let value: String

    var body: some View {
        HStack(spacing: 6) {
            UsageProgramDot(program: program)
            Text(name).frame(maxWidth: .infinity, alignment: .leading)
            Text(value).fontWeight(.semibold).monospacedDigit()
        }
    }
}

/// A large Usage widget's row: the figure, and the other metric beside it.
struct UsageTableRow<Leading: View>: View {
    @ViewBuilder let leading: () -> Leading
    let name: String
    let summary: UsageWidgetSnapshot.Summary
    let metric: AgentUsageMetric
    @Environment(\.locale) private var locale

    var body: some View {
        HStack(spacing: 8) {
            leading().frame(width: 8)
            Text(name).frame(maxWidth: .infinity, alignment: .leading)
            Text(metric == .cost
                ? AgentUsageStyle.tokens(summary.tokens, locale: locale)
                : UsageWidgetText.cost(summary.cost, locale: locale))
                .foregroundStyle(.secondary)
                .frame(width: 64, alignment: .trailing)
            Text(UsageWidgetText.value(summary, metric: metric, locale: locale))
                .fontWeight(.semibold)
                .frame(width: 84, alignment: .trailing)
        }
        .font(.footnote.monospacedDigit())
        .frame(height: 20)
    }
}
