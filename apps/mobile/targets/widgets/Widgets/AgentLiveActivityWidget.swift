import ActivityKit
import SwiftUI
import UIKit
import WidgetKit

/// Live Activity for one Host. The lock-screen banner gives each visible
/// Agent its configured fields, with a height-limited set of Agent cards. Rows
/// arrive in the sender's pin-aware order and are rendered as given.
/// Agent rows deep-link to their detail while
/// the surrounding chrome opens the Console.
struct AgentLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: AgentActivityAttributes.self) { context in
            let presentation = AgentActivityDecryptor.presentation(for: context.state)
            AgentActivityLockScreenContainer(
                presentation: presentation,
                hostID: context.attributes.hostID,
                isStale: context.isStale,
                approval: AgentActivityApproval.make(
                    presentation: presentation, hostID: context.attributes.hostID,
                    isStale: context.isStale)
            )
        } dynamicIsland: { context in
            let presentation = AgentActivityDecryptor.presentation(for: context.state)
            return AgentActivityIsland.make(
                presentation: presentation,
                hostID: context.attributes.hostID,
                approval: AgentActivityApproval.make(
                    presentation: presentation, hostID: context.attributes.hostID,
                    isStale: context.isStale))
        }
    }
}

// MARK: - Surface seam

enum AgentActivitySurface {
    /// Lock Screen banner. Status colors remain dynamic so ActivityKit can
    /// resolve the theme's light-surface colors in Light appearance and its
    /// dark-surface ones in Dark appearance.
    case lockScreen
    /// Compact, minimal, and expanded Dynamic Island. Always the dark-surface
    /// colors, resolved against a dark trait collection, ignoring ambient
    /// Light Mode.
    case island
}

/// The app's status colors (`AgenticoTheme`, compiled into this target):
/// the ink is the status color for the surface's appearance, the wash the
/// status token itself.
enum AgentActivityStatusStyle {
    /// The extension cannot read the theme chosen in the app; it shows the
    /// default theme, the only one so far.
    private static let theme = AgenticoTheme.default

    static func ink(for status: String, on surface: AgentActivitySurface) -> Color {
        Color(uiColor: resolvedUIColor(for: status, role: .ink, on: surface))
    }

    static func wash(for status: String, on surface: AgentActivitySurface) -> Color {
        Color(uiColor: resolvedUIColor(for: status, role: .wash, on: surface))
    }

    private enum Role { case ink, wash }

    private static func resolvedUIColor(
        for status: String, role: Role, on surface: AgentActivitySurface
    ) -> UIColor {
        let agentStatus = knownStatus(for: status)
        let uiColor: UIColor
        switch role {
        case .ink: uiColor = theme.dynamicStatusColor(agentStatus)
        case .wash: uiColor = theme.colors.status(agentStatus).uiColor
        }
        switch surface {
        case .lockScreen:
            return uiColor
        case .island:
            return uiColor.resolvedColor(with: UITraitCollection(userInterfaceStyle: .dark))
        }
    }

    private static func knownStatus(for status: String) -> AgentStatus {
        switch status {
        case "blocked", "done", "working":
            return AgentStatus(rawValue: status)
        default:
            return .unknown
        }
    }
}

enum AgentActivitySemanticStyle {
    static func primary(on surface: AgentActivitySurface) -> Color {
        switch surface {
        case .lockScreen:
            Color(uiColor: .label)
        case .island:
            Color.primary
        }
    }

    static func secondary(on surface: AgentActivitySurface) -> Color {
        switch surface {
        case .lockScreen:
            Color(uiColor: .secondaryLabel)
        case .island:
            Color.secondary
        }
    }
}

// MARK: - Lock screen

private struct AgentActivityLockScreenContainer: View {
    let presentation: AgentActivityPresentation
    let hostID: String
    let isStale: Bool
    let approval: AgentActivityApproval?

    var body: some View {
        AgentActivityLockScreenView(
            presentation: presentation,
            hostID: hostID,
            isStale: isStale,
            approval: approval
        )
        .foregroundStyle(AgentActivitySemanticStyle.primary(on: .lockScreen))
        .activityBackgroundTint(Color(uiColor: AgentActivityLockScreenChrome.backgroundColor))
        .activitySystemActionForegroundColor(
            Color(uiColor: AgentActivityLockScreenChrome.actionColor))
    }
}

enum AgentActivityLockScreenChrome {
    /// Keep these semantic colors unresolved so ActivityKit can apply the
    /// system appearance when its host provides the correct trait collection.
    static let backgroundColor = UIColor.systemBackground
    static let actionColor = UIColor.label
}

struct AgentActivityLockScreenView: View {
    let presentation: AgentActivityPresentation
    let hostID: String
    let isStale: Bool
    /// The Blocked Agent to answer from here (spec F5, R5); the banner then
    /// shows that Agent with its prompt and buttons instead of the list.
    var approval: AgentActivityApproval? = nil

    var body: some View {
        ZStack {
            Color(uiColor: AgentActivityLockScreenChrome.backgroundColor)
                .ignoresSafeArea()

            if let approval {
                approvalBody(approval)
            } else {
                listBody
            }
        }
        .widgetURL(AgentActivityLink.consoleURL(hostID: hostID))
    }

    /// The asking Agent's card and chips, its prompt and buttons, and the
    /// rest of the inventory as a count.
    private func approvalBody(_ approval: AgentActivityApproval) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .top, spacing: 8) {
                AgentActivityLinkedRow(
                    hostID: hostID,
                    agent: approval.headlineAgent,
                    surface: .lockScreen,
                    minimumHeight: AgentActivityRowMetrics.denseMinimumHeight)
                Spacer(minLength: 8)
                AgentActivityCountChips(counts: presentation.counts, surface: .lockScreen)
            }
            AgentActivityApprovalPanel(hostID: hostID, approval: approval, surface: .lockScreen)
            if let caption = approvalCaption {
                Text(caption)
                    .font(.caption2)
                    .foregroundStyle(AgentActivitySemanticStyle.secondary(on: .lockScreen))
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, AgentActivityRowMetrics.lockScreenBannerVerticalPadding)
    }

    private var approvalCaption: String? {
        let others = max(0, presentation.counts.total - 1)
        let staleCaption = String(localized: "May be out of date")
        switch (others > 0, isStale) {
        case (true, true): return "\(String(localized: "+\(others) more")) · \(staleCaption)"
        case (true, false): return String(localized: "+\(others) more")
        case (false, true): return staleCaption
        case (false, false): return nil
        }
    }

    private var listBody: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            ForEach(
                visibleAgents.dropFirst(), id: \.paneID
            ) { @Sendable [rowMinimumHeight] agent in
                AgentActivityLinkedRow(
                    hostID: hostID,
                    agent: agent,
                    surface: .lockScreen,
                    minimumHeight: rowMinimumHeight)
            }
            if let caption = presentation.lockScreenTrailingCaption(isStale: isStale) {
                Text(caption)
                    .font(.caption2)
                    .foregroundStyle(AgentActivitySemanticStyle.secondary(on: .lockScreen))
            }
            #if DEBUG
                if let reason = AgentActivityDecryptor.lastFailureReason {
                    Text(reason)
                        .font(.caption2)
                        .foregroundStyle(
                            AgentActivitySemanticStyle.secondary(on: .lockScreen)
                        )
                        .lineLimit(3)
                }
            #endif
        }
        .padding(.horizontal, 14)
        .padding(.vertical, AgentActivityRowMetrics.lockScreenBannerVerticalPadding)
    }

    private var visibleAgents: [AgentActivityDetails.AgentDetail] {
        presentation.lockScreenAgents(isStale: isStale)
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 8) {
            headline
            Spacer(minLength: 8)
            AgentActivityCountChips(counts: presentation.counts, surface: .lockScreen)
        }
    }

    @ViewBuilder
    private var headline: some View {
        if let first = visibleAgents.first {
            AgentActivityLinkedRow(
                hostID: hostID,
                agent: first,
                surface: .lockScreen,
                minimumHeight: rowMinimumHeight)
        } else {
            Text(presentation.headerTitle)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(AgentActivitySemanticStyle.primary(on: .lockScreen))
                .lineLimit(1)
        }
    }

    private var rowMinimumHeight: CGFloat {
        AgentActivityRowMetrics.lockScreenMinimumHeight(agentCount: visibleAgents.count)
    }
}
