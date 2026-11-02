import Foundation

/// Approve and Deny on a Blocked notification (spec F5): the identifiers the
/// app registers at launch and every notification that offers the actions
/// names. Shared with the Notification Service Extension, which picks the
/// category for a decrypted push, and the Live Activity widget.
enum ApprovalNotification {
    /// Open, Deny and Approve.
    static let categoryID = "AGENT_APPROVAL"
    /// Open and Deny: the user could not read everything Approve would
    /// answer (a prompt cut short, spec F5 decision 3), or the request may
    /// only be denied from a notification (`ApprovalPreview.isDenyOnly`).
    static let denyOnlyCategoryID = "AGENT_APPROVAL_DENY_ONLY"

    static let openActionID = "agentico.open"
    static let denyActionID = "agentico.deny"
    static let approveActionID = "agentico.approve"

    /// How long after the transition a notification still answers from
    /// outside the app (spec F5, decision 4). A prompt left on the Lock
    /// Screen for longer is opened, not approved.
    static let timeToLive: TimeInterval = 30 * 60

    /// The most of the prompt a notification shows, in characters, so the
    /// Lock Screen exposes little of it (spec F5, security). A longer prompt
    /// is cut there, and Approve goes with it.
    static let bodyLimit = 120

    /// The category for a decrypted payload: nil (no buttons) unless the
    /// Agent is Blocked and the plugin sent an approvable prompt to bind to.
    static func categoryID(for payload: NotificationPayload) -> String? {
        guard payload.status == .blocked, let approval = payload.approval, approval.isApprovable,
            approval.prompt != nil
        else { return nil }
        return offersApprove(approval) ? categoryID : denyOnlyCategoryID
    }

    /// The notification body for `prompt`: all of it up to `bodyLimit`,
    /// else its start and `…`.
    static func body(for prompt: String) -> String {
        guard prompt.count > bodyLimit else { return prompt }
        return String(prompt.prefix(bodyLimit - 1)).trimmingCharacters(in: .whitespaces) + "…"
    }

    /// Whether a notification may offer Approve for `approval`: only when it
    /// shows the whole request as it reads. Not when the plugin or the body
    /// limit cut the prompt, not when the plugin marked the request Deny
    /// only, and not when the prompt or a label holds an invisible format
    /// character, which can make a command read as another.
    static func offersApprove(_ approval: ApprovalPreview) -> Bool {
        guard let prompt = approval.prompt, !approval.isDenyOnly, !approval.isPromptCut,
            prompt.count <= bodyLimit
        else { return false }
        return !([prompt] + approval.options).contains(where: hasFormatCharacters)
    }

    /// Whether `text` holds a Unicode format character (general category
    /// Cf): bidi overrides and isolates such as U+202E and U+2066,
    /// zero-width marks, a soft hyphen.
    static func hasFormatCharacters(_ text: String) -> Bool {
        text.unicodeScalars.contains { $0.properties.generalCategory == .format }
    }
}

/// Which Hosts this device approves from notifications for, mirrored into
/// the shared app-group container (spec F5, D7). The Host's registration
/// file is the truth the settings screen shows; this copy lets an approval
/// action, and later the Live Activity widget, check the opt-in without
/// SSH. Missing or unreadable means off, so every failure fails closed.
struct ApprovalOptInMirror: Sendable {
    /// Injectable for tests; the production value is the shared app-group
    /// container.
    var containerURL: URL? = FileManager.default.containerURL(
        forSecurityApplicationGroupIdentifier: NotificationKeyStore.sharedAccessGroup)

    private var fileURL: URL? {
        containerURL?.appendingPathComponent("approval-opt-in.json")
    }

    func isEnabled(for hostID: UUID) -> Bool {
        hostIDs().contains(hostID)
    }

    /// Every Host approving from notifications; empty on any failure.
    func hostIDs() -> Set<UUID> {
        guard let url = fileURL, let data = try? Data(contentsOf: url),
            let stored = try? JSONDecoder().decode(StoredFile.self, from: data), stored.v == 1
        else { return [] }
        return Set(stored.hosts.compactMap(UUID.init(uuidString:)))
    }

    /// Best effort: a failed write leaves the previous mirror, which the
    /// next confirmed settings read rewrites.
    func setEnabled(_ enabled: Bool, for hostID: UUID) {
        var hosts = hostIDs()
        guard enabled != hosts.contains(hostID), let url = fileURL else { return }
        if enabled { hosts.insert(hostID) } else { hosts.remove(hostID) }
        let stored = StoredFile(v: 1, hosts: hosts.map(\.uuidString).sorted())
        guard let data = try? JSONEncoder().encode(stored) else { return }
        try? data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    private struct StoredFile: Codable {
        let v: Int
        let hosts: [String]
    }
}
