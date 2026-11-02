import ActivityKit
import SwiftUI
import UIKit
import WidgetKit

// MARK: - Dynamic Island

/// The island speaks in status tokens: a glyph whose shape names the status,
/// then that status's count. The most urgent status leads; the others trail.
enum AgentActivityIsland {
    static func make(
        presentation: AgentActivityPresentation, hostID: String, approval: AgentActivityApproval? = nil
    ) -> DynamicIsland {
        let counts = presentation.counts
        return DynamicIsland {
            DynamicIslandExpandedRegion(.leading) {
                AgentActivityIslandHeadline(counts: counts)
            }
            DynamicIslandExpandedRegion(.trailing) {
                AgentActivityIslandTrailingTokens(counts: counts)
                    .frame(
                        maxWidth: .infinity, minHeight: AgentActivityIslandMetrics.headerHeight,
                        alignment: .trailing)
            }
            DynamicIslandExpandedRegion(.bottom) {
                AgentActivityIslandRows(presentation: presentation, hostID: hostID, approval: approval)
            }
        } compactLeading: {
            AgentActivityCompactLeading(counts: counts)
        } compactTrailing: {
            AgentActivityCompactTrailing(counts: counts)
        } minimal: {
            AgentActivityMinimal(counts: counts)
        }
        .contentMargins(
            [.leading, .trailing], AgentActivityIslandMetrics.expandedSideMargin, for: .expanded)
        .keylineTint(islandKeylineTint(counts: counts))
        .widgetURL(AgentActivityLink.consoleURL(hostID: hostID))
    }

    private static func islandKeylineTint(
        counts: AgentActivityAttributes.ContentState.Counts
    ) -> Color {
        if counts.blocked > 0 {
            return AgentActivityStatusStyle.ink(for: "blocked", on: .island)
        }
        return AgentActivityStatusStyle.ink(for: "unknown", on: .island)
    }
}

enum AgentActivityIslandMetrics {
    /// Glyph beside a count in the compact presentation and expanded tally.
    static let tokenGlyph: CGFloat = 15
    static let minimalGlyph: CGFloat = 13
    static let rowGlyph: CGFloat = 13
    /// The expanded headline glyph is this wide and each row glyph is centered
    /// in a column this wide, so glyph centers and text edges share one line.
    static let markerColumn: CGFloat = 19
    /// Matches the gap between a row's marker and its text.
    static let markerSpacing: CGFloat = 7
    /// Shared by the expanded leading and trailing regions so their contents
    /// sit on one center line beside the camera.
    static let headerHeight: CGFloat = 20
    /// The system clips expanded content to the island's shape inset about
    /// 15 pt, whose 27 pt corners cut into the default 18 pt side margins: the
    /// header glyph lost its top-left edge and the last trailing digit its
    /// right half. Measured on an iPhone 17 Pro simulator (iOS 27).
    static let expandedSideMargin: CGFloat = 25
    static let rowSpacing: CGFloat = 2
    /// Line heights of the `.caption` first line and `.caption2` later lines.
    static let rowFirstLineHeight: CGFloat = 16
    static let rowLineHeight: CGFloat = 13
    static let overflowCaptionHeight: CGFloat = 12
    /// Height the expanded island leaves for the rows and their overflow
    /// caption. Measured on an iPhone 17 Pro simulator (iOS 27): the rows
    /// start 46 pt below the island's top edge (system inset, header, and the
    /// gap under it) and the system clips content 13 pt above the bottom
    /// edge, which sits at most 160 pt down. A smaller bottom content margin
    /// shortens the island without moving that clip.
    static let rowsHeightBudget: CGFloat = 100

    /// A row's text height. The island has no room for the lock screen's
    /// padded 44 pt cards, so rows hug their lines; a one-line row still
    /// keeps the dense target as its pitch.
    static func rowHeight(for agent: AgentActivityDetails.AgentDetail) -> CGFloat {
        let lines = AgentActivityFields.rows(for: agent).count
        return max(
            AgentActivityRowMetrics.denseMinimumHeight - rowSpacing,
            rowFirstLineHeight + CGFloat(max(0, lines - 1)) * rowLineHeight)
    }
}

extension View {
    /// The expanded island cannot grow past 160 pt, and its glyphs and row
    /// budget are sized for the default text size, so larger Dynamic Type
    /// sizes stop there instead of pushing rows under the clip.
    func islandTypeSize() -> some View {
        dynamicTypeSize(...DynamicTypeSize.large)
    }
}

/// Status shapes, so the tally never relies on color alone: an exclamation
/// mark asks for the user, a check mark has a result to read, an open ring is
/// still running.
struct AgentActivityStatusGlyph: View {
    let status: String
    let size: CGFloat

    var body: some View {
        Group {
            switch status {
            case "blocked":
                Image(systemName: "exclamationmark.circle.fill").resizable().scaledToFit()
            case "done":
                Image(systemName: "checkmark.circle.fill").resizable().scaledToFit()
            case "working":
                openRing
            default:
                Circle().padding(size * 0.23)
            }
        }
        .frame(width: size, height: size)
        .foregroundStyle(AgentActivityStatusStyle.ink(for: status, on: .island))
        .accessibilityHidden(true)
    }

    /// Drawn rather than a symbol: a Live Activity cannot spin, so the ring
    /// stays open to read as unfinished at rest.
    private var openRing: some View {
        let lineWidth = size * 0.14
        let ink = AgentActivityStatusStyle.ink(for: status, on: .island)
        return ZStack {
            Circle().stroke(ink.opacity(0.28), lineWidth: lineWidth)
            Circle()
                .trim(from: 0, to: 0.75)
                .stroke(ink, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .rotationEffect(.degrees(-90))
        }
        .padding(lineWidth / 2)
    }
}

/// "2 blocked" for a count chip or label: one whole phrase per status, so a
/// translation can make the status agree with the count. Unknown wire
/// statuses read as they arrive.
enum AgentActivityCountText {
    static func text(count: Int, status: String) -> String {
        switch status {
        case "blocked": String(localized: "\(count) blocked")
        case "working": String(localized: "\(count) working")
        case "done": String(localized: "\(count) done")
        case "idle": String(localized: "\(count) idle")
        default: "\(count) \(status)"
        }
    }
}

/// One status on the island: its glyph, then its count, in that status's ink.
struct AgentActivityStatusToken: View {
    let status: String
    /// Nil draws the glyph alone.
    let count: Int?
    var glyphSize = AgentActivityIslandMetrics.tokenGlyph
    var font = Font.subheadline.weight(.semibold)

    var body: some View {
        HStack(spacing: 3) {
            AgentActivityStatusGlyph(status: status, size: glyphSize)
            if let count {
                Text("\(count)")
            }
        }
        .font(font.monospacedDigit())
        .foregroundStyle(AgentActivityStatusStyle.ink(for: status, on: .island))
    }
}

/// The most urgent status. When it is the only status, its count moves across
/// the camera to the trailing side, so the two sides never repeat one number.
struct AgentActivityCompactLeading: View {
    let counts: AgentActivityAttributes.ContentState.Counts

    var body: some View {
        let items = counts.attentionItems
        if let top = items.first {
            AgentActivityStatusToken(status: top.status, count: items.count > 1 ? top.count : nil)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(AgentActivityCountText.text(count: top.count, status: top.status))
        }
    }
}

struct AgentActivityCompactTrailing: View {
    let counts: AgentActivityAttributes.ContentState.Counts

    var body: some View {
        let items = counts.attentionItems
        if items.count == 1, let only = items.first {
            Text("\(only.count)")
                .font(.subheadline.weight(.semibold).monospacedDigit())
                .foregroundStyle(AgentActivityStatusStyle.ink(for: only.status, on: .island))
                // The leading side already speaks this count.
                .accessibilityHidden(true)
        } else {
            AgentActivityIslandTrailingTokens(counts: counts)
        }
    }
}

/// Every status after the most urgent one, in attention order.
struct AgentActivityIslandTrailingTokens: View {
    let counts: AgentActivityAttributes.ContentState.Counts

    var body: some View {
        let rest = Array(counts.attentionItems.dropFirst())
        if !rest.isEmpty {
            HStack(spacing: 7) {
                ForEach(rest, id: \.status) { @Sendable item in
                    AgentActivityStatusToken(status: item.status, count: item.count)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(AgentActivityNarration.countsLabel(rest))
            .islandTypeSize()
        }
    }
}

struct AgentActivityMinimal: View {
    let counts: AgentActivityAttributes.ContentState.Counts

    var body: some View {
        if let top = counts.attentionItems.first {
            AgentActivityStatusToken(
                status: top.status, count: top.count,
                glyphSize: AgentActivityIslandMetrics.minimalGlyph,
                font: .footnote.weight(.bold)
            )
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(AgentActivityNarration.countsLabel(counts.attentionItems))
        }
    }
}

/// Expanded leading region: the most urgent status, spelled out.
struct AgentActivityIslandHeadline: View {
    let counts: AgentActivityAttributes.ContentState.Counts

    var body: some View {
        if let top = counts.attentionItems.first {
            HStack(spacing: AgentActivityIslandMetrics.markerSpacing) {
                AgentActivityStatusGlyph(
                    status: top.status, size: AgentActivityIslandMetrics.markerColumn)
                Text(AgentActivityCountText.text(count: top.count, status: top.status))
                    .font(.subheadline.weight(.semibold).monospacedDigit())
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .foregroundStyle(AgentActivityStatusStyle.ink(for: top.status, on: .island))
            .frame(
                maxWidth: .infinity, minHeight: AgentActivityIslandMetrics.headerHeight,
                alignment: .leading
            )
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(AgentActivityCountText.text(count: top.count, status: top.status))
            .islandTypeSize()
        }
    }
}

/// Expanded bottom region: as many Agent rows as the island's height allows.
struct AgentActivityIslandRows: View {
    let presentation: AgentActivityPresentation
    let hostID: String
    /// The Blocked Agent to answer from here (spec F5, R5): only its row,
    /// prompt and buttons fit the island's height.
    var approval: AgentActivityApproval? = nil

    var body: some View {
        if let approval {
            VStack(alignment: .leading, spacing: AgentActivityIslandMetrics.rowSpacing) {
                AgentActivityLinkedRow(
                    hostID: hostID,
                    agent: approval.headlineAgent,
                    surface: .island,
                    minimumHeight: AgentActivityIslandMetrics.rowFirstLineHeight)
                AgentActivityApprovalPanel(hostID: hostID, approval: approval, surface: .island)
                    .padding(
                        .leading,
                        AgentActivityIslandMetrics.markerColumn + AgentActivityIslandMetrics.markerSpacing)
            }
            .islandTypeSize()
        } else {
            rows
        }
    }

    private var rows: some View {
        VStack(alignment: .leading, spacing: AgentActivityIslandMetrics.rowSpacing) {
            ForEach(presentation.expandedAgents, id: \.paneID) { @Sendable agent in
                AgentActivityLinkedRow(
                    hostID: hostID,
                    agent: agent,
                    surface: .island,
                    minimumHeight: AgentActivityIslandMetrics.rowHeight(for: agent))
            }
            if presentation.overflowCount > 0 {
                Text("+\(presentation.overflowCount) more")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .padding(
                        .leading,
                        AgentActivityIslandMetrics.markerColumn
                            + AgentActivityIslandMetrics.markerSpacing)
                    .frame(height: AgentActivityIslandMetrics.overflowCaptionHeight)
            }
        }
        .islandTypeSize()
    }
}

enum AgentActivityNarration {
    static func rowLabel(for agent: AgentActivityDetails.AgentDetail) -> String {
        let rows = AgentActivityFields.rows(for: agent).map { $0.map(\.text).joined() }
        return (rows.filter { !$0.isEmpty } + [agent.status]).joined(separator: ", ")
    }

    static func countsLabel(_ items: [(status: String, count: Int)]) -> String {
        items.map { "\($0.count) \($0.status)" }.joined(separator: ", ")
    }
}
