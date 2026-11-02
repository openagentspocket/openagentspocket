import SwiftUI
import WidgetKit

@main
struct AgenticoWidgetsBundle: WidgetBundle {
    var body: some Widget {
        AgentLiveActivityWidget()
        UsageWidget()
        UsageLimitsWidget()
    }
}
