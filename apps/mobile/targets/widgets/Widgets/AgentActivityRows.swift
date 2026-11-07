import ActivityKit
import SwiftUI
import UIKit
import WidgetKit

// MARK: - Shared pieces

enum AgentActivityRowMetrics {
    /// Apple's default iOS control size when the presentation has room.
    static let comfortableMinimumHeight: CGFloat = 44
    /// Apple's documented minimum iOS control size for dense layouts.
    static let denseMinimumHeight: CGFloat = 28

    static func lockScreenMinimumHeight(agentCount: Int) -> CGFloat {
        agentCount <= 3 ? comfortableMinimumHeight : denseMinimumHeight
    }

    /// Three configured rows render at about 43.5 pt (caption + 2 x caption2
    /// plus the card's vertical padding), so a three-row card is held to the
    /// comfortable 44 pt target; two rows or fewer fit the dense target.
    static let threeRowMinimumHeight: CGFloat = comfortableMinimumHeight

    /// Vertical padding of the whole lock-screen banner.
    static let lockScreenBannerVerticalPadding: CGFloat = 6
    /// Rendered height of the trailing caption2 line (overflow / stale).
    static let lockScreenCaptionHeight: CGFloat = 14
    /// ActivityKit's lock-screen presentation height limit.
    static let lockScreenHeightBudget: CGFloat = 160

    static func minimumHeight(for agent: AgentActivityDetails.AgentDetail) -> CGFloat {
        AgentActivityFields.rows(for: agent).count > 2 ? threeRowMinimumHeight : denseMinimumHeight
    }
}

/// Wraps row content in a deep link to that Agent's detail. The outer
/// widgetURL remains the fallback for taps on the surrounding chrome.
private struct AgentActivityLinked<Content: View>: View {
    let hostID: String
    let agent: AgentActivityDetails.AgentDetail
    let surface: AgentActivitySurface
    let minimumHeight: CGFloat
    @ViewBuilder let content: Content

    var body: some View {
        if let url = AgentActivityLink.agentURL(hostID: hostID, paneID: agent.paneID) {
            Link(destination: url) {
                content
                    .frame(maxWidth: .infinity, minHeight: minimumHeight, alignment: .leading)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .tint(AgentActivitySemanticStyle.primary(on: surface))
            .accessibilityLabel(AgentActivityNarration.rowLabel(for: agent))
            .accessibilityHint("Opens this Agent in Agentico")
        } else {
            content
                .frame(maxWidth: .infinity, minHeight: minimumHeight, alignment: .leading)
        }
    }
}

struct AgentActivityLinkedRow: View {
    let hostID: String
    let agent: AgentActivityDetails.AgentDetail
    let surface: AgentActivitySurface
    let minimumHeight: CGFloat

    var body: some View {
        AgentActivityLinked(
            hostID: hostID,
            agent: agent,
            surface: surface,
            minimumHeight: surface == .island
                ? minimumHeight
                : max(minimumHeight, AgentActivityRowMetrics.minimumHeight(for: agent))
        ) {
            AgentActivityRowView(agent: agent, surface: surface)
        }
    }
}

/// A Blocked Agent's prompt with Deny and Approve (spec F5, R5), or what
/// the last tap came to. The buttons are links that open the app, which
/// answers like a notification action (`AgentActivityLink.answerURL`).
/// Labels are the prompt's own option labels.
struct AgentActivityApprovalPanel: View {
    let hostID: String
    let approval: AgentActivityApproval
    let surface: AgentActivitySurface

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            // The whole prompt the buttons answer: at most the notification
            // body's 120 characters, and Approve only when that is all of it.
            Text(approval.ask.displayPrompt)
                .font(.caption2)
                .foregroundStyle(AgentActivitySemanticStyle.primary(on: surface))
                .lineLimit(3)
                .fixedSize(horizontal: false, vertical: true)
            // One line of controls: the buttons, then what the last tap
            // came to, so a result never pushes the banner past its height.
            HStack(spacing: 8) {
                if approval.showsButtons {
                    buttons
                }
                if let result = approval.ask.result {
                    Text(result.message)
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(AgentActivitySemanticStyle.secondary(on: surface))
                        .lineLimit(2)
                }
            }
        }
    }

    private var buttons: some View {
        Group {
            if let deny = approval.denyLabel, let url = answerURL(.deny) {
                Link(destination: url) {
                    Text(deny).lineLimit(1)
                }
                .tint(.red)
                .accessibilityLabel("Deny: \(deny)")
            }
            if let approve = approval.approveLabel, let url = answerURL(.approve) {
                Link(destination: url) {
                    Text(approve).lineLimit(1)
                }
                .tint(AgentActivityStatusStyle.ink(for: "blocked", on: surface))
                .accessibilityLabel("Approve: \(approve)")
            }
        }
        .font(.caption.weight(.semibold))
        .buttonStyle(.bordered)
        .controlSize(.small)
        .disabled(!approval.isEnabled)
    }

    private func answerURL(_ answer: AgentActivityLink.Answer) -> URL? {
        AgentActivityLink.answerURL(
            hostID: hostID, paneID: approval.agent.paneID, episodeID: approval.ask.episodeID, answer: answer)
    }
}

struct AgentActivityCountChips: View {
    let counts: AgentActivityAttributes.ContentState.Counts
    let surface: AgentActivitySurface

    var body: some View {
        HStack(spacing: 5) {
            ForEach(counts.chipItems, id: \.status) { @Sendable item in
                Text(AgentActivityCountText.text(count: item.count, status: item.status))
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(AgentActivityStatusStyle.ink(for: item.status, on: surface))
                    // Chips never compress or wrap; the row title truncates
                    // instead when all three statuses are present.
                    .fixedSize()
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(
                        AgentActivityStatusStyle.wash(for: item.status, on: surface)
                            .opacity(AgenticoTheme.statusWashOpacity),
                        in: Capsule())
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            counts.chipItems.map { "\($0.count) \($0.status)" }.joined(separator: ", "))
    }
}

/// The same rendered field rows used by the Console, with a status marker
/// that remains visible even when every configured field is empty.
enum AgentActivityFields {
    static func rows(for agent: AgentActivityDetails.AgentDetail) -> [[AgentActivityDetails.Field]] {
        if let configured = agent.rows { return Array(configured.prefix(3)) }
        let kind = AgentNotificationIdentity.kindLabel(agent.kind)
        if let workspace = agent.displayWorkspace {
            return [[.init(text: workspace)], [.init(text: kind)]]
        }
        return [[.init(text: kind)]]
    }

    static func attributedText(
        _ fields: [AgentActivityDetails.Field], rowIndex: Int, surface: AgentActivitySurface
    ) -> AttributedString {
        var result = AttributedString()
        for field in fields {
            var span = AttributedString(field.text)
            let font: Font = rowIndex == 0 ? .caption : .caption2
            let weight: Font.Weight = if let bold = field.bold {
                bold ? .bold : .regular
            } else {
                rowIndex == 0 ? .semibold : .medium
            }
            span.font = font.weight(weight)
            span.foregroundColor = foreground(for: field, rowIndex: rowIndex, surface: surface)
            result.append(span)
        }
        return result
    }

    static func foreground(
        for field: AgentActivityDetails.Field, rowIndex: Int, surface: AgentActivitySurface
    ) -> Color {
        if let hex = field.fg, let color = hexColor(hex) {
            return Color(uiColor: color).opacity(field.dim == true ? 0.6 : 1)
        }
        if field.dim == true {
            let color: UIColor = rowIndex == 0 ? .secondaryLabel : .tertiaryLabel
            return Color(uiColor: surface == .island
                ? color.resolvedColor(with: UITraitCollection(userInterfaceStyle: .dark)) : color)
        }
        return rowIndex == 0
            ? AgentActivitySemanticStyle.primary(on: surface)
            : AgentActivitySemanticStyle.secondary(on: surface)
    }

    private static func hexColor(_ value: String) -> UIColor? {
        guard value.first == "#", value.utf8.count == 4 || value.utf8.count == 7 else { return nil }
        let digits = value.dropFirst()
        guard digits.utf8.allSatisfy({
            (48...57).contains($0) || (65...70).contains($0) || (97...102).contains($0)
        }) else { return nil }
        let expanded = digits.count == 3 ? digits.map { "\($0)\($0)" }.joined() : String(digits)
        guard let rgb = UInt32(expanded, radix: 16) else { return nil }
        return UIColor(
            red: CGFloat((rgb >> 16) & 0xff) / 255,
            green: CGFloat((rgb >> 8) & 0xff) / 255,
            blue: CGFloat(rgb & 0xff) / 255, alpha: 1)
    }
}

struct AgentActivityRowView: View {
    let agent: AgentActivityDetails.AgentDetail
    let surface: AgentActivitySurface

    var body: some View {
        HStack(alignment: .top, spacing: 7) {
            marker
            VStack(alignment: .leading, spacing: 0) {
                ForEach(
                    Array(AgentActivityFields.rows(for: agent).enumerated()), id: \.offset
                ) { @Sendable index, row in
                    Text(AgentActivityFields.attributedText(row, rowIndex: index, surface: surface))
                        .lineLimit(1)
                }
            }
        }
        .padding(.vertical, agent.rows == nil || surface == .island ? 0 : 1)
        .layoutPriority(1)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(AgentActivityNarration.rowLabel(for: agent))
    }

    /// A dot on the Lock Screen, where the chips name each status; the
    /// island's own glyph there, matching the tokens in its header.
    @ViewBuilder
    private var marker: some View {
        switch surface {
        case .lockScreen:
            Circle()
                .fill(AgentActivityStatusStyle.ink(for: agent.status, on: surface))
                .frame(width: 7, height: 7)
                .padding(.top, 4)
                .accessibilityHidden(true)
        case .island:
            AgentActivityStatusGlyph(
                status: agent.status, size: AgentActivityIslandMetrics.rowGlyph
            )
            .frame(width: AgentActivityIslandMetrics.markerColumn)
            .padding(.top, 1.5)
        }
    }
}
