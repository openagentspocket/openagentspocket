import AppIntents
import Foundation
import Synchronization

/// The answer a Live Activity button gives (spec F5, R5). The app maps it
/// onto its own `ApprovalDecision`; this module cannot see app code.
enum ActivityApprovalChoice: String, Sendable, Equatable {
    case approve
    case deny
}

/// One tap on a Live Activity's Approve or Deny, as the app process gets it.
/// Nothing here is trusted on its own: the app opens `envelope` with the
/// Host's Notification Key and answers only the prompt that envelope shows
/// for `paneID` under `episodeID`.
struct ActivityApprovalRequest: Sendable, Equatable {
    /// The activity's Host (`AgentActivityAttributes.hostID`).
    let hostID: String
    let paneID: String
    /// The `bid` of the prompt the button was drawn for.
    let episodeID: String
    /// The sealed details envelope the button was drawn from: the
    /// content-state frame `{v,kid,n,ct}` as JSON.
    let envelope: String
    let choice: ActivityApprovalChoice
}

/// Where the Live Activity's Approve and Deny land in the app process. The
/// intents are compiled into the widget too, which has no runner, so the app
/// installs the handler at launch (`PushRegistrationDelegate`); without one
/// a tap sends nothing.
final class ActivityApprovalIntentHandler: Sendable {
    typealias Handler = @Sendable (ActivityApprovalRequest) async -> Void

    static let shared = ActivityApprovalIntentHandler()

    private let handler = Mutex<Handler?>(nil)

    func install(_ handler: @escaping Handler) {
        self.handler.withLock { $0 = handler }
    }

    /// Hands `request` to the installed handler and waits for it; false,
    /// with nothing sent, when no handler is installed.
    @discardableResult
    func run(_ request: ActivityApprovalRequest) async -> Bool {
        guard let handler = handler.withLock({ $0 }) else { return false }
        await handler(request)
        return true
    }
}

/// Approve on a Blocked Agent's Live Activity (spec F5, R5). It runs in the
/// app process (`LiveActivityIntent`) and only on an unlocked device: the
/// system asks for authentication first, the way a notification's
/// `.authenticationRequired` Approve does, and the app refuses again if the
/// device reads as locked. Hidden from Shortcuts and Siri.
struct ApproveAgentIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Approve"
    static let description = IntentDescription("Approves the prompt a Blocked Agent waits on.")
    static let authenticationPolicy: IntentAuthenticationPolicy = .requiresAuthentication
    static let isDiscoverable = false

    @Parameter(title: "Host")
    var hostID: String
    @Parameter(title: "Pane")
    var paneID: String
    @Parameter(title: "Episode")
    var episodeID: String
    @Parameter(title: "Envelope")
    var envelope: String

    init() {}

    init(hostID: String, paneID: String, episodeID: String, envelope: String) {
        self.hostID = hostID
        self.paneID = paneID
        self.episodeID = episodeID
        self.envelope = envelope
    }

    var request: ActivityApprovalRequest {
        ActivityApprovalRequest(
            hostID: hostID, paneID: paneID, episodeID: episodeID, envelope: envelope, choice: .approve)
    }

    func perform() async throws -> some IntentResult {
        await ActivityApprovalIntentHandler.shared.run(request)
        return .result()
    }
}

/// Deny on a Blocked Agent's Live Activity (spec F5, R5). Declining runs
/// nothing, so like the notification's Deny it may run on a locked device.
/// It can never approve: the choice is fixed by the type.
struct DenyAgentIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Deny"
    static let description = IntentDescription("Denies the prompt a Blocked Agent waits on.")
    static let authenticationPolicy: IntentAuthenticationPolicy = .alwaysAllowed
    static let isDiscoverable = false

    @Parameter(title: "Host")
    var hostID: String
    @Parameter(title: "Pane")
    var paneID: String
    @Parameter(title: "Episode")
    var episodeID: String
    @Parameter(title: "Envelope")
    var envelope: String

    init() {}

    init(hostID: String, paneID: String, episodeID: String, envelope: String) {
        self.hostID = hostID
        self.paneID = paneID
        self.episodeID = episodeID
        self.envelope = envelope
    }

    var request: ActivityApprovalRequest {
        ActivityApprovalRequest(
            hostID: hostID, paneID: paneID, episodeID: episodeID, envelope: envelope, choice: .deny)
    }

    func perform() async throws -> some IntentResult {
        await ActivityApprovalIntentHandler.shared.run(request)
        return .result()
    }
}
