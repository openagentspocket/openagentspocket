import ActivityKit
import SwiftUI
import UIKit
import WidgetKit

// MARK: - Previews

/// Style gallery: every lock-screen state without a device, a push, or a
/// live agent. Open this file's canvas in Xcode to review the banner.
#if DEBUG
    private func previewAgent(
        _ status: String, kind: String, workspace: String? = "Agentico", name: String? = nil,
        pane: String, title: String? = nil
    ) -> AgentActivityDetails.AgentDetail {
        AgentActivityDetails.AgentDetail(
            paneID: pane, kind: kind, name: name, workspace: workspace, status: status,
            title: title)
    }

    private enum AgentActivityPreviewFixtures {
        static let longGraphemeTitle = String(repeating: "锁", count: 80)
        static let longGraphemeName = String(repeating: "屏", count: 80)

        static var configuredFields: AgentActivityPresentation {
            let agents = (1...4).map { index in
                AgentActivityDetails.AgentDetail(
                    paneID: "w1:p\(index)", kind: "claude", workspace: "Agentico",
                    status: index == 1 ? "blocked" : "working", title: nil,
                    rows: [
                        [.init(text: "Agentico"), .init(text: " · "), .init(text: "Claude", dim: true)],
                        [.init(text: "Review sidebar fields")],
                        [.init(text: "~/Projects/Agentico", dim: true)],
                    ])
            }
            return .detailed(details: .init(hostName: "mbp", agents: agents),
                counts: .init(working: 3, blocked: 1, done: 0))
        }

        static var mixedOverflow: AgentActivityPresentation {
            .detailed(
                details: AgentActivityDetails(
                    hostName: "mbp",
                    agents: [
                        previewAgent(
                            "blocked", kind: "claude", name: "reviewer", pane: "w1:p1",
                            title: "Approve the transport refactor plan"),
                        previewAgent(
                            "done", kind: "droid", name: "doc-writer", pane: "w1:p2",
                            title: "API reference draft finished"),
                        previewAgent(
                            "working", kind: "grok", name: "la-demo", pane: "w1:p3",
                            title: "Research ActivityKit budgets"),
                        previewAgent(
                            "working", kind: "codex", name: "fixer", pane: "w1:p4",
                            title: "Chase the flaky pairing test"),
                        previewAgent(
                            "working", kind: "claude", pane: "w1:p5",
                            title: "Refactor the transport queue"),
                    ]),
                counts: .init(working: 4, blocked: 1, done: 1))
        }

        static var singleUnnamedIdentityOnly: AgentActivityPresentation {
            .detailed(
                details: AgentActivityDetails(
                    hostName: "mbp",
                    agents: [previewAgent("working", kind: "claude", pane: "w1:p1")]),
                counts: .init(working: 1, blocked: 0, done: 0))
        }

        static var fourRows: AgentActivityPresentation {
            .detailed(
                details: AgentActivityDetails(
                    hostName: "mbp",
                    agents: [
                        previewAgent(
                            "blocked", kind: "claude", name: "reviewer", pane: "w1:p1",
                            title: "Approve the transport refactor plan"),
                        previewAgent(
                            "working", kind: "claude", pane: "w1:p2",
                            title: "Refactor the transport queue"),
                        previewAgent(
                            "working", kind: "grok", name: "la-demo", pane: "w1:p3",
                            title: "Write the landing copy"),
                        previewAgent(
                            "working", kind: "codex", name: "fixer", pane: "w1:p4",
                            title: "Chase the flaky pairing test"),
                    ]),
                counts: .init(working: 3, blocked: 1, done: 0))
        }

        static var countsOnly: AgentActivityPresentation {
            .countsOnly(counts: .init(working: 2, blocked: 1, done: 0))
        }

        static var longTitle: AgentActivityPresentation {
            .detailed(
                details: AgentActivityDetails(
                    hostName: "mbp",
                    agents: [
                        previewAgent(
                            "blocked", kind: "claude", name: "reviewer", pane: "w1:p1",
                            title: longGraphemeTitle),
                        previewAgent("working", kind: "grok", pane: "w1:p2", title: "Second row"),
                    ]),
                counts: .init(working: 1, blocked: 1, done: 1))
        }

        static var longNameWithTitle: AgentActivityPresentation {
            .detailed(
                details: AgentActivityDetails(
                    hostName: "mbp",
                    agents: [
                        previewAgent(
                            "blocked", kind: "claude", name: longGraphemeName, pane: "w1:p1",
                            title: "Approve the transport refactor plan"),
                    ]),
                counts: .init(working: 0, blocked: 1, done: 0))
        }

        static var longNameNoTitle: AgentActivityPresentation {
            .detailed(
                details: AgentActivityDetails(
                    hostName: "mbp",
                    agents: [
                        previewAgent(
                            "working", kind: "claude", name: longGraphemeName, pane: "w1:p1"),
                    ]),
                counts: .init(working: 1, blocked: 0, done: 0))
        }

        static var staleMaxHeight: AgentActivityPresentation {
            .detailed(
                details: AgentActivityDetails(
                    hostName: "mbp",
                    agents: [
                        previewAgent("blocked", kind: "claude", pane: "w1:p1", title: "First"),
                        previewAgent("done", kind: "droid", pane: "w1:p2", title: "Second"),
                        previewAgent("working", kind: "grok", pane: "w1:p3", title: "Third"),
                        previewAgent("working", kind: "codex", pane: "w1:p4", title: "Fourth"),
                        previewAgent("working", kind: "claude", pane: "w1:p5", title: "Fifth"),
                    ]),
                counts: .init(working: 3, blocked: 1, done: 1))
        }

        static var staleThreeRows: AgentActivityPresentation {
            .detailed(
                details: AgentActivityDetails(
                    hostName: "mbp",
                    agents: [
                        previewAgent("blocked", kind: "claude", pane: "w1:p1", title: "First"),
                        previewAgent("done", kind: "droid", pane: "w1:p2", title: "Second"),
                        previewAgent("working", kind: "grok", pane: "w1:p3", title: "Third"),
                    ]),
                counts: .init(working: 1, blocked: 1, done: 1))
        }

        static var expandedMixed: AgentActivityPresentation {
            .detailed(
                details: AgentActivityDetails(
                    hostName: "mbp",
                    agents: [
                        previewAgent(
                            "blocked", kind: "claude", name: "reviewer", pane: "w1:p1",
                            title: "Approve the transport refactor plan"),
                        previewAgent(
                            "done", kind: "droid", name: "doc-writer", pane: "w1:p2",
                            title: "API reference draft finished"),
                        previewAgent(
                            "working", kind: "grok", name: "la-demo", pane: "w1:p3",
                            title: "Research ActivityKit budgets"),
                    ]),
                counts: .init(working: 1, blocked: 1, done: 1))
        }
    }

    private func previewLockScreenBanner(
        _ presentation: AgentActivityPresentation,
        colorScheme: ColorScheme,
        isStale: Bool = false
    ) -> some View {
        AgentActivityLockScreenView(
            presentation: presentation,
            hostID: "6D8EC348-4DAF-455C-BA8F-5FCC41799C0E",
            isStale: isStale
        )
        .background(
            colorScheme == .light
                ? Color(white: 0.97)
                : Color(red: 28 / 255, green: 28 / 255, blue: 30 / 255),
            in: RoundedRectangle(cornerRadius: 22, style: .continuous)
        )
        .environment(\.colorScheme, colorScheme)
        .padding()
    }

    private func previewIslandCompact(
        counts: AgentActivityAttributes.ContentState.Counts,
        colorScheme: ColorScheme = .light
    ) -> some View {
        HStack(spacing: 0) {
            AgentActivityCompactLeading(counts: counts)
            // Stands in for the camera housing between the two sides.
            Color.clear.frame(width: 126)
            AgentActivityCompactTrailing(counts: counts)
        }
        .padding(.horizontal, 11)
        .frame(height: 37)
        .background(Color.black, in: Capsule())
        .environment(\.colorScheme, colorScheme)
        .padding()
    }

    private func previewIslandMinimal(
        counts: AgentActivityAttributes.ContentState.Counts,
        colorScheme: ColorScheme = .light
    ) -> some View {
        AgentActivityMinimal(counts: counts)
            .frame(width: 37, height: 37)
            .background(Color.black, in: Circle())
            .environment(\.colorScheme, colorScheme)
            .padding()
    }

    private func previewIslandExpanded(
        _ presentation: AgentActivityPresentation,
        colorScheme: ColorScheme = .light
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 0) {
                AgentActivityIslandHeadline(counts: presentation.counts)
                AgentActivityIslandTrailingTokens(counts: presentation.counts)
            }
            AgentActivityIslandRows(
                presentation: presentation, hostID: "6D8EC348-4DAF-455C-BA8F-5FCC41799C0E")
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
        .frame(width: 371)
        .background(Color.black, in: RoundedRectangle(cornerRadius: 40, style: .continuous))
        .environment(\.colorScheme, colorScheme)
        .padding()
    }

    #Preview("Configured fields (Light)") {
        previewLockScreenBanner(AgentActivityPreviewFixtures.configuredFields, colorScheme: .light)
    }

    #Preview("Configured fields (Dark, stale)") {
        previewLockScreenBanner(
            AgentActivityPreviewFixtures.configuredFields, colorScheme: .dark, isStale: true)
    }

    #Preview("Configured fields (Expanded island)") {
        previewIslandExpanded(AgentActivityPreviewFixtures.configuredFields)
    }

    #Preview("P1 Mixed + overflow (Light)") {
        previewLockScreenBanner(AgentActivityPreviewFixtures.mixedOverflow, colorScheme: .light)
    }

    #Preview("P1 Mixed + overflow (Dark)") {
        previewLockScreenBanner(AgentActivityPreviewFixtures.mixedOverflow, colorScheme: .dark)
    }

    #Preview("P2 Unnamed identity only (Light)") {
        previewLockScreenBanner(
            AgentActivityPreviewFixtures.singleUnnamedIdentityOnly, colorScheme: .light)
    }

    #Preview("P2 Unnamed identity only (Dark)") {
        previewLockScreenBanner(
            AgentActivityPreviewFixtures.singleUnnamedIdentityOnly, colorScheme: .dark)
    }

    #Preview("P3 Four rows (Light)") {
        previewLockScreenBanner(AgentActivityPreviewFixtures.fourRows, colorScheme: .light)
    }

    #Preview("P3 Four rows (Dark)") {
        previewLockScreenBanner(AgentActivityPreviewFixtures.fourRows, colorScheme: .dark)
    }

    #Preview("P4 Counts only (Light)") {
        previewLockScreenBanner(AgentActivityPreviewFixtures.countsOnly, colorScheme: .light)
    }

    #Preview("P4 Counts only (Dark)") {
        previewLockScreenBanner(AgentActivityPreviewFixtures.countsOnly, colorScheme: .dark)
    }

    #Preview("P5 Long title (Light)") {
        previewLockScreenBanner(AgentActivityPreviewFixtures.longTitle, colorScheme: .light)
    }

    #Preview("P5 Long title (Dark)") {
        previewLockScreenBanner(AgentActivityPreviewFixtures.longTitle, colorScheme: .dark)
    }

    #Preview("P5a Long name with title (Light)") {
        previewLockScreenBanner(AgentActivityPreviewFixtures.longNameWithTitle, colorScheme: .light)
    }

    #Preview("P5a Long name with title (Dark)") {
        previewLockScreenBanner(AgentActivityPreviewFixtures.longNameWithTitle, colorScheme: .dark)
    }

    #Preview("P5b Long name, no title (Light)") {
        previewLockScreenBanner(AgentActivityPreviewFixtures.longNameNoTitle, colorScheme: .light)
    }

    #Preview("P5b Long name, no title (Dark)") {
        previewLockScreenBanner(AgentActivityPreviewFixtures.longNameNoTitle, colorScheme: .dark)
    }

    #Preview("P6 Stale max height (Light)") {
        previewLockScreenBanner(
            AgentActivityPreviewFixtures.staleMaxHeight, colorScheme: .light, isStale: true)
    }

    #Preview("P6 Stale max height (Dark)") {
        previewLockScreenBanner(
            AgentActivityPreviewFixtures.staleMaxHeight, colorScheme: .dark, isStale: true)
    }

    #Preview("P6b Stale three rows (Light)") {
        previewLockScreenBanner(
            AgentActivityPreviewFixtures.staleThreeRows, colorScheme: .light, isStale: true)
    }

    #Preview("P6b Stale three rows (Dark)") {
        previewLockScreenBanner(
            AgentActivityPreviewFixtures.staleThreeRows, colorScheme: .dark, isStale: true)
    }

    #Preview("P7 Compact blocked (Light island)") {
        previewIslandCompact(counts: .init(working: 2, blocked: 1, done: 0))
    }

    #Preview("P8 Compact done + working") {
        previewIslandCompact(counts: .init(working: 2, blocked: 0, done: 1))
    }

    #Preview("P9 Compact working only") {
        previewIslandCompact(counts: .init(working: 3, blocked: 0, done: 0))
    }

    #Preview("P9b Compact all three statuses") {
        previewIslandCompact(counts: .init(working: 3, blocked: 1, done: 1))
    }

    #Preview("P10 Minimal blocked (Light island)") {
        previewIslandMinimal(counts: .init(working: 2, blocked: 1, done: 0))
    }

    #Preview("P10b Minimal working only") {
        previewIslandMinimal(counts: .init(working: 2, blocked: 0, done: 0))
    }

    #Preview("P11 Expanded mixed (Light island)") {
        previewIslandExpanded(AgentActivityPreviewFixtures.expandedMixed)
    }
#endif
