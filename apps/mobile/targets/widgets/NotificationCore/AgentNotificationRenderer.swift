import Foundation
import UserNotifications

/// What the Notification Service Extension ends up showing: either decrypted
/// Agent Notification content or the generic fallback banner.
struct AgentNotificationAlert: Sendable, Equatable {
    let title: String
    let body: String
}

/// The service extension's logic as a pure function (#71): take the push's
/// `userInfo` and the registered Notification Keys, select the key by the
/// envelope's kid, decrypt, and phrase the alert as workspace, Agent kind, and
/// status. Anything undecryptable — missing or non-string envelope, unknown
/// kid, any `NotificationEnvelopeError` — degrades to `fallback`, which the
/// extension applies unconditionally so a forged push can never render
/// attacker-chosen text (spec #68, user story 20).
enum AgentNotificationRenderer {
    /// Mirrors the relay's generic wrap copy; deliberately unalarming.
    static let fallback = AgentNotificationAlert(title: "Agentico", body: String(localized: "Agent update"))

    static func alert(
        userInfo: [AnyHashable: Any], keys: [NotificationKeyRecord]
    ) -> AgentNotificationAlert {
        guard let (_, payload) = NotificationEnvelope.open(userInfo: userInfo, keys: keys)
        else { return fallback }
        let alert = alert(
            workspace: payload.project, agentKind: payload.agentKind, status: payload.status)
        // A Blocked push with an approval preview says what the Agent asks
        // (spec F5), at most `bodyLimit` characters of it on the Lock
        // Screen. A prompt cut there never offers Approve.
        guard payload.status == .blocked, let prompt = payload.approval?.prompt else { return alert }
        return AgentNotificationAlert(title: alert.title, body: ApprovalNotification.body(for: prompt))
    }

    /// What the extension hands back to iOS: the push's content with the
    /// alert rewritten and the default sound set. iOS plays nothing for an
    /// alert without a sound (#468); with it, the user can still turn sounds
    /// off under Settings > Notifications > Agentico.
    static func content(
        rewriting content: UNNotificationContent, keys: [NotificationKeyRecord]
    ) -> UNNotificationContent {
        let alert = alert(userInfo: content.userInfo, keys: keys)
        guard let rewritten = content.mutableCopy() as? UNMutableNotificationContent else {
            return content
        }
        rewritten.title = alert.title
        // Cleared, not left alone: the relay's generic wrap may have set a
        // subtitle, and the decrypted copy has no use for one.
        rewritten.subtitle = ""
        rewritten.body = alert.body
        rewritten.sound = .default
        if let link = link(userInfo: content.userInfo, keys: keys) {
            rewritten.userInfo[linkKey] = link
        }
        return rewritten
    }

    /// Where a tap on the notification leads. Set after decryption, so it
    /// stays on the device and a forged push never names a screen.
    static let linkKey = "agenticoLink"

    /// The app link of the Agent a push is about; nil when it cannot be opened.
    static func link(userInfo: [AnyHashable: Any], keys: [NotificationKeyRecord]) -> String? {
        guard let (record, payload) = NotificationEnvelope.open(userInfo: userInfo, keys: keys),
            let pane = payload.paneID.addingPercentEncoding(withAllowedCharacters: .alphanumerics)
        else { return nil }
        return "openagentspocket://agent/\(record.hostID.uuidString.lowercased())/\(pane)"
    }

    /// The one phrasing of an Agent Notification, shared by the push path
    /// above and the in-app foreground banner (#77) so the wording cannot
    /// drift between them.
    ///
    /// The workspace leads: with several agents running, it is what tells one
    /// notification from another — the agent kind rarely differs. The Host is
    /// deliberately absent: it is the same machine every time and spends the
    /// whole line on an address nobody reads. The encrypted wire still calls
    /// this value `project` for backward compatibility with older plugins.
    static func alert(
        workspace: String?, agentKind: String, status: AgentStatus
    ) -> AgentNotificationAlert {
        return AgentNotificationAlert(
            title: AgentNotificationIdentity.title(workspace: workspace, kind: agentKind),
            body: body(for: status))
    }

    private static func body(for status: AgentStatus) -> String {
        switch status {
        case .blocked: String(localized: "Blocked — waiting for input")
        case .done: String(localized: "Done")
        // The status set is open on the wire; render unrecognized values
        // factually instead of guessing at their meaning.
        default: String(localized: "Status: \(status.rawValue)")
        }
    }
}
