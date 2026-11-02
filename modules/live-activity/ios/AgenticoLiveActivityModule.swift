import ActivityKit
import ExpoModulesCore
import Foundation

/// ActivityKit failed to start the activity; the message carries ActivityKit's own reason.
final class LiveActivityRequestException: GenericException<String>, @unchecked Sendable {
    override var reason: String { param }
}

/// Starts, updates and ends the per-Host agent Live Activity and reports its push tokens and run
/// states. Content crosses the bridge as the JSON of `AgentActivityAttributes.ContentState`
/// (docs: Live Activity wire contract), so the TypeScript side owns what the activity shows.
/// ActivityKit stays the source of truth: nothing here caches an `Activity`.
public final class AgenticoLiveActivityModule: Module {
    private var observers: [String: [Task<Void, Never>]] = [:]

    public func definition() -> ModuleDefinition {
        Name("AgenticoLiveActivity")

        Events("onPushToken", "onStateChange")

        Function("areActivitiesEnabled") { () -> Bool in
            ActivityAuthorizationInfo().areActivitiesEnabled
        }

        /// Starts the Host's activity with `pushType: .token` so the plugin can update it after
        /// the app suspends. Returns the activity id.
        AsyncFunction("request") { (hostId: String, contentJson: String) -> String in
            let state = try Self.decode(contentJson)
            do {
                let activity = try Activity.request(
                    attributes: AgentActivityAttributes(hostID: hostId),
                    content: ActivityContent(state: state, staleDate: nil),
                    pushType: .token)
                return activity.id
            } catch {
                throw LiveActivityRequestException(String(describing: error))
            }
        }

        AsyncFunction("update") { (id: String, contentJson: String) in
            let state = try Self.decode(contentJson)
            guard let activity = Self.activity(id: id) else { return }
            await activity.update(ActivityContent(state: state, staleDate: nil))
        }

        AsyncFunction("end") { (id: String, finalContentJson: String?, immediate: Bool) in
            guard let activity = Self.activity(id: id) else { return }
            let content = try finalContentJson.map {
                ActivityContent(state: try Self.decode($0), staleDate: nil)
            }
            await activity.end(content, dismissalPolicy: immediate ? .immediate : .default)
        }

        AsyncFunction("currentActivities") { () -> [[String: String]] in
            Activity<AgentActivityAttributes>.activities.map {
                ["id": $0.id, "hostId": $0.attributes.hostID]
            }
        }

        AsyncFunction("currentContent") { (id: String) -> String? in
            guard let state = Self.activity(id: id)?.content.state,
                let data = try? JSONEncoder().encode(state)
            else { return nil }
            return String(data: data, encoding: .utf8)
        }

        /// Starts forwarding the activity's push tokens (the current one first) and run states
        /// as `onPushToken` / `onStateChange` events. Idempotent per id.
        Function("observe") { (id: String) in
            self.observe(id)
        }

        Function("unobserve") { (id: String) in
            self.stopObserving(id)
        }

        OnDestroy {
            for tasks in self.observers.values { tasks.forEach { $0.cancel() } }
            self.observers.removeAll()
        }
    }

    private func observe(_ id: String) {
        guard observers[id] == nil, let activity = Self.activity(id: id) else { return }
        let tokens = Task { [weak self] in
            for await token in activity.pushTokenUpdates {
                let hex = token.map { String(format: "%02x", $0) }.joined()
                self?.sendEvent("onPushToken", ["id": id, "token": hex])
            }
        }
        let states = Task { [weak self] in
            for await state in activity.activityStateUpdates {
                self?.sendEvent("onStateChange", ["id": id, "state": Self.name(of: state)])
            }
        }
        observers[id] = [tokens, states]
    }

    private func stopObserving(_ id: String) {
        observers.removeValue(forKey: id)?.forEach { $0.cancel() }
    }

    private static func activity(id: String) -> Activity<AgentActivityAttributes>? {
        Activity<AgentActivityAttributes>.activities.first { $0.id == id }
    }

    private static func decode(_ json: String) throws -> AgentActivityAttributes.ContentState {
        try JSONDecoder().decode(AgentActivityAttributes.ContentState.self, from: Data(json.utf8))
    }

    private static func name(of state: ActivityState) -> String {
        switch state {
        case .active, .pending: "active"
        case .stale: "stale"
        case .ended: "ended"
        case .dismissed: "dismissed"
        @unknown default: "active"
        }
    }
}
