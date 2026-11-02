import SwiftUI
import WidgetKit

// MARK: Parts

/// A widget with nothing to add up: why, and where to go.
struct UsageWidgetMessage: View {
    let family: WidgetFamily
    let symbol: String
    let title: (String, String?)
    let message: String

    var body: some View {
        switch family {
        case .accessoryInline:
            Label(message, systemImage: symbol)
        case .accessoryCircular:
            ZStack {
                AccessoryWidgetBackground()
                Image(systemName: symbol).font(.title3)
            }
            .accessibilityLabel(message)
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 2) {
                Text(title.0).font(.system(size: 13, weight: .semibold))
                Text(message).font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        default:
            VStack(alignment: .leading, spacing: 0) {
                UsageWidgetHeader(title: title.0, detail: title.1)
                Spacer(minLength: 8)
                Image(systemName: symbol)
                    .font(.system(size: 20))
                    .foregroundStyle(.secondary)
                Text(message)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(3)
                    .padding(.top, 8)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
    }
}

/// "Today · All Hosts".
struct UsageWidgetHeader: View {
    let title: String
    let detail: String?

    var body: some View {
        (Text(title).fontWeight(.semibold)
            + Text(detail.map { " · \($0)" } ?? "").foregroundStyle(.secondary))
            .font(.footnote)
            .lineLimit(1)
    }
}

/// When the figures were read; a stale reading says so in a capsule.
struct UsageWidgetUpdated: View {
    let readAt: Date?
    let now: Date
    @Environment(\.colorScheme) private var colorScheme

    /// The extension cannot read the theme chosen in the app; it shows the
    /// warning of the built-in theme that matches the system appearance, so
    /// the chip stays legible on a light widget background.
    private var stale: Color {
        (colorScheme == .light ? AgenticoTheme.papel : AgenticoTheme.noche).colors.warning.color
    }

    var body: some View {
        if let readAt {
            if UsageWidgetText.isStale(readAt, now: now) {
                Label(UsageWidgetText.updated(readAt, now: now), systemImage: "clock")
                    .labelStyle(UsageCompactLabelStyle())
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(stale)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(stale.opacity(AgenticoTheme.statusWashOpacity), in: .capsule)
                    .widgetAccentable()
            } else {
                Text(UsageWidgetText.updated(readAt, now: now))
                    .font(.caption2).foregroundStyle(.secondary)
            }
        }
    }
}

private struct UsageCompactLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 3) {
            configuration.icon.imageScale(.small)
            configuration.title
        }
    }
}

/// The figure a widget leads with: a cost, or a token count with its unit.
struct UsageFigure: View {
    let summary: UsageWidgetSnapshot.Summary
    let metric: AgentUsageMetric
    let size: CGFloat
    @Environment(\.locale) private var locale

    var body: some View {
        Group {
            switch metric {
            case .cost:
                Text(UsageWidgetText.cost(summary.cost, locale: locale))
            case .tokens:
                Text(AgentUsageStyle.tokens(summary.tokens, locale: locale))
                    + Text(" tokens").font(.system(size: size * 0.5, weight: .semibold))
            }
        }
        .font(.system(size: size, weight: .semibold).monospacedDigit())
        .minimumScaleFactor(0.5)
        .lineLimit(1)
    }
}

struct UsageProgramDot: View {
    let program: String
    @Environment(\.widgetRenderingMode) private var renderingMode

    var body: some View {
        Circle()
            .fill(UsageWidgetColor.program(program, mode: renderingMode))
            .frame(width: 8, height: 8)
            .widgetAccentable(program == "claude")
    }
}

/// A program's dot and name, heading its Usage Limits: "Claude Code ·
/// claude-2" for an Account, or the Account alone where that does not fit,
/// since the name is what tells Accounts apart.
struct UsageProgramTitle: View {
    let program: String
    let name: String
    var account: String?
    var size: CGFloat = 13

    var body: some View {
        HStack(spacing: 6) {
            UsageProgramDot(program: program)
            if let account {
                ViewThatFits(in: .horizontal) {
                    Text("\(name) · \(account)")
                    Text(account).truncationMode(.middle)
                }
                .font(.system(size: size, weight: .semibold))
            } else {
                Text(name).font(.system(size: size, weight: .semibold))
            }
        }
        .lineLimit(1)
    }
}

/// A program's Accounts, one line each. Every line's bar is as wide, and
/// narrows when the longest name would not fit beside it.
struct UsageAccountLines: View {
    let entries: [UsageWidgetSnapshot.Limits]
    let now: Date
    var size: CGFloat = 12
    let barWidths: (wide: CGFloat, narrow: CGFloat)
    let spacing: CGFloat

    var body: some View {
        ViewThatFits(in: .horizontal) {
            lines(barWidth: barWidths.wide)
            lines(barWidth: barWidths.narrow)
        }
    }

    private func lines(barWidth: CGFloat) -> some View {
        VStack(alignment: .leading, spacing: spacing) {
            ForEach(entries) { UsageAccountLine(limits: $0, now: now, size: size, barWidth: barWidth) }
        }
    }
}

/// One Claude Code Account on one line: its name, and its tightest running
/// window's bar and percentage. No reading leaves the bar empty.
struct UsageAccountLine: View {
    let limits: UsageWidgetSnapshot.Limits
    let now: Date
    var size: CGFloat = 12
    let barWidth: CGFloat

    var body: some View {
        let window = UsageLimitsPick.tightest(limits.windows, now: now).flatMap { $0.isExpired(at: now) ? nil : $0 }
        HStack(spacing: 6) {
            Text(limits.account ?? limits.name)
                .truncationMode(.middle)
                .frame(maxWidth: .infinity, alignment: .leading)
            UsageBar(fraction: (window?.usedPercent ?? 0) / 100, program: limits.program)
                .frame(width: barWidth)
            Text(UsageWidgetText.percent(window?.usedPercent))
                .fontWeight(.semibold)
                .monospacedDigit()
                .frame(minWidth: size * 2.6, alignment: .trailing)
        }
        .font(.system(size: size))
        .lineLimit(1)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityLabel(window))
    }

    private func accessibilityLabel(_ window: UsageWidgetSnapshot.Window?) -> String {
        let name = limits.account ?? limits.name
        guard let window else { return "\(name), \(limits.message ?? UsageWidgetText.windowReset)" }
        return "\(name), \(window.name) \(UsageWidgetText.percent(window.usedPercent))"
    }
}

/// A medium widget's entries, one line each: the window that resets
/// soonest and the most used of the rest. More entries take tighter lines.
struct UsageLimitsLines: View {
    let entries: [UsageWidgetSnapshot.Limits]
    let now: Date

    var body: some View {
        ViewThatFits(in: .vertical) {
            lines(showsProgram: true, size: 12, spacing: 7)
            lines(showsProgram: false, size: 12, spacing: 5)
            lines(showsProgram: false, size: 11, spacing: 2)
        }
    }

    private func lines(showsProgram: Bool, size: CGFloat, spacing: CGFloat) -> some View {
        VStack(alignment: .leading, spacing: spacing) {
            ForEach(entries) { limits in
                UsageLimitsLine(limits: limits, now: now, showsProgram: showsProgram, size: size)
            }
        }
    }
}
