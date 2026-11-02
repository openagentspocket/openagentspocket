import Foundation

/// A Blocked Agent's prompt on the Live Activity (spec F5, R5): the episode,
/// prompt and labels a Blocked notification carries (`bid`, `act`, `q`,
/// `opts`), plus the transition second the episode id hashes (`ts`), which
/// the Host's apply checks before it claims the episode. Display and binding
/// only, like the notification's fields: the app reads the screen again
/// before anything is sent, and the Host compares the exact prompt and label
/// right before it presses (docs/agents/live-activity-contract.md, `ask`).
struct ActivityApprovalAsk: Sendable, Equatable {
    /// The Blocked episode id (`bid`), spent once per Host.
    var episodeID: String
    /// `act` 2: the request may only be denied from outside the app.
    var isDenyOnly: Bool
    /// `q`, exactly as the Host extracted it: at most 240 UTF-16 units, a
    /// longer prompt ends with `…`.
    var prompt: String
    /// `opts`: up to four labels in screen order.
    var options: [String]
    /// `ts`: the transition's unix seconds.
    var timestamp: Int
    /// `res`: what the last tap on this prompt came to. Only this device's
    /// own local update sets it; a Host never sends it.
    var result: ActivityApprovalResult?

    init(
        episodeID: String, isDenyOnly: Bool = false, prompt: String, options: [String], timestamp: Int,
        result: ActivityApprovalResult? = nil
    ) {
        self.episodeID = episodeID
        self.isDenyOnly = isDenyOnly
        self.prompt = prompt
        self.options = options
        self.timestamp = timestamp
        self.result = result
    }

    /// The notification's view of the same prompt, so the activity and the
    /// notification answer by one set of rules (`ApprovalNotification`).
    var preview: ApprovalPreview {
        ApprovalPreview(
            episodeID: episodeID, isApprovable: true, isDenyOnly: isDenyOnly, prompt: prompt, options: options)
    }

    /// Whether the activity may offer Approve: exactly when a notification
    /// for this prompt would (whole prompt within the body limit, not Deny
    /// only, no invisible format characters).
    var offersApprove: Bool {
        ApprovalNotification.offersApprove(preview)
    }

    /// The prompt as the activity shows it: the notification body's cut.
    var displayPrompt: String {
        ApprovalNotification.body(for: prompt)
    }

    /// The wire value of `act`.
    var actionFlag: Int { isDenyOnly ? 2 : 1 }
}

/// What a tap on the activity's Approve or Deny came to (`res`), shown in
/// place of the buttons until the next update. English for now, like the
/// notification feedback (spec F5, decision 7).
enum ActivityApprovalResult: String, Sendable, Equatable, CaseIterable {
    /// The action is running.
    case sending
    /// The answer took.
    case sent
    case notWaiting = "not_waiting"
    /// This episode was already answered, here or on another device.
    case answered
    case promptChanged = "prompt_changed"
    case expired
    case optedOut = "opted_out"
    case unreachable
    case hostKeyChanged = "host_key_changed"
    case overlayOnly = "overlay_only"
    case updatePlugin = "update_plugin"
    /// A cut prompt or a Deny-only request: Approve belongs in the app.
    case approveInApp = "approve_in_app"
    /// Approve while the device is locked.
    case unlockToApprove = "unlock_to_approve"
    case unconfirmed
    case mayHaveSent = "may_have_sent"
    case timedOut = "timed_out"

    var message: String {
        switch self {
        case .sending: String(localized: "Sending…")
        case .sent: String(localized: "Sent.")
        case .notWaiting: String(localized: "No longer waiting.")
        case .answered: String(localized: "Already answered.")
        case .promptChanged: String(localized: "That prompt changed. Nothing was sent.")
        case .expired: String(localized: "Too old to answer from here. Open the Agent.")
        case .optedOut: String(localized: "Approving from outside the app is off for this Host.")
        case .unreachable: String(localized: "Couldn't reach the Host. Nothing was sent.")
        case .hostKeyChanged: String(localized: "The Host's key changed. Open Agentico.")
        case .overlayOnly: String(localized: "Open Agentico to answer on this network.")
        case .updatePlugin: String(localized: "Update the plugin to answer from here.")
        case .approveInApp: String(localized: "Approve this one in the app. Nothing was sent.")
        case .unlockToApprove: String(localized: "Unlock your iPhone to approve. Nothing was sent.")
        case .unconfirmed: String(localized: "Sent, but the Agent didn't react. Check it.")
        case .mayHaveSent: String(localized: "The answer may not have gone through. Check the Agent.")
        case .timedOut: String(localized: "Timed out. Nothing was confirmed.")
        }
    }

    /// While an action runs the buttons stay hidden; afterwards only a
    /// result that leaves the prompt answerable shows them again.
    var hidesButtons: Bool {
        switch self {
        case .unreachable, .unlockToApprove, .timedOut: false
        default: true
        }
    }
}
