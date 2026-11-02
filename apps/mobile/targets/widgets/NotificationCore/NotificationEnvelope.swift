import Foundation

/// A decrypted Agent Notification payload: what a Host's notify hook tells
/// this device about an Agent Status transition (ADR 0008).
struct NotificationPayload: Sendable, Equatable {
    /// The herdr pane id the Agent lives in; drives the Attach deep link.
    let paneID: String
    /// The agent kind as herdr reports it (claude, codex, ...).
    let agentKind: String
    /// The new Agent Status. An open set like everywhere else on the herdr
    /// wire: unrecognized values pass through for forward compatibility.
    let status: AgentStatus
    /// When the transition happened.
    let timestamp: Date
    /// The workspace label the Agent runs in — the project name the alert
    /// leads with. Nil when the Host could not resolve it, or when the plugin
    /// predates the field.
    let project: String?
    /// The Agent's terminal title, stripped of status glyphs: what the agent
    /// is working on. Nil under the same conditions as `project`.
    let title: String?
    /// The approval preview (spec F5), present only when this device opted
    /// into approving from notifications on the Host.
    let approval: ApprovalPreview?

    init(
        paneID: String, agentKind: String, status: AgentStatus, timestamp: Date,
        project: String? = nil, title: String? = nil, approval: ApprovalPreview? = nil
    ) {
        self.paneID = paneID
        self.agentKind = agentKind
        self.status = status
        self.timestamp = timestamp
        self.project = project
        self.title = title
        self.approval = approval
    }
}

/// What a Blocked notification says about the prompt it was sent for: the
/// wire fields `bid`, `act`, `q` and `opts` (spec F5). Display and binding
/// only. The app never picks a key from them; it reads the screen again and
/// answers only while that screen still shows `prompt`.
struct ApprovalPreview: Sendable, Equatable {
    /// The Blocked episode id, the same on every device notified about one
    /// transition and spent once (`ApprovalLedger`).
    let episodeID: String
    /// The plugin's hint that the prompt looks like a permission the app may
    /// answer (`act` 1 or 2). The app decides for itself at action time.
    let isApprovable: Bool
    /// The plugin's hint that the request may only be denied from a
    /// notification (`act` 2): an edit, a new file or a patch shows a path,
    /// not what it writes, and a prompt with invisible format characters can
    /// read as something it is not.
    let isDenyOnly: Bool
    /// The prompt text the plugin read, at most 240 characters; a longer one
    /// ends with `…`.
    let prompt: String?
    /// Up to four option labels in screen order, each cut to 40 characters.
    let options: [String]

    init(
        episodeID: String, isApprovable: Bool, isDenyOnly: Bool = false, prompt: String? = nil,
        options: [String] = []
    ) {
        self.episodeID = episodeID
        self.isApprovable = isApprovable
        self.isDenyOnly = isApprovable && isDenyOnly
        self.prompt = prompt
        self.options = options
    }

    /// Whether the plugin cut the prompt short: the notification then never
    /// offers Approve, since the user could not see all of it (spec F5,
    /// decision 3).
    var isPromptCut: Bool { prompt?.hasSuffix("…") ?? false }
}

/// The notification envelope v1: the encrypted payload carried from the
/// plugin's notify hook through the Push Relay and APNs to this app
/// (ADR 0008). Wire format, a compact JSON object:
///
///     {"v": 1, "kid": "...", "n": "...", "ct": "..."}
///
/// `ct` is the AES-256-GCM ciphertext (plus 16-byte tag) of a compact JSON
/// plaintext `{"pane", "kind", "status", "ts"}` (plus the optional display
/// and approval fields) under the per-host
/// Notification Key, with the version string bound as additional
/// authenticated data. The schema lives in `plugin/README.md`; the shared
/// test vectors in `plugin/test-vectors/notification-payload-v1.json` are
/// the single source of truth for this decoder and the plugin's encoder
/// (which proves the encrypt direction). Unknown fields at either layer are
/// ignored (additive v1 metadata); breaking changes bump the version, which
/// both implementations must honor together.
enum NotificationEnvelope {
    static let version = 1
    /// At most this many approval option labels; more is a broken payload.
    static let approvalOptionsLimit = 4

    /// Additional authenticated data binding the ciphertext to envelope v1,
    /// so a re-framed ciphertext under a different version fails to open.
    private static var additionalData: Data {
        Data("HERDR-NOTIFY:\(version)".utf8)
    }

    /// Derives the cleartext key id for a raw 32-byte Notification Key: the
    /// first 8 bytes of SHA-256 over the key, unpadded base64url. Both ends
    /// derive it, so it never needs to be stored or exchanged separately;
    /// the app uses it to select the right key (and thus Host) when several
    /// Hosts are registered.
    static func keyID(for key: Data) -> String {
        SealedEnvelopeCodec.keyID(for: key)
    }

    /// Reads the cleartext key id off an envelope without decrypting it, so
    /// the right Notification Key can be selected when several Hosts are
    /// registered. Nil when the framing is too broken to carry one; version
    /// and ciphertext checks stay `decrypt`'s job.
    static func peekKeyID(in envelope: Data) -> String? {
        SealedEnvelopeCodec.peekKeyID(in: envelope)
    }

    /// The shared front half of alert rendering (#71) and tap routing (#74):
    /// read the envelope string off a push's `userInfo`, select the
    /// Notification Key record by the envelope's kid, and decrypt. Nil for
    /// anything undecryptable — missing or non-string envelope, unknown kid,
    /// any `NotificationEnvelopeError` — and each caller picks its own
    /// fallback (generic banner, Console).
    static func open(
        userInfo: [AnyHashable: Any], keys: [NotificationKeyRecord]
    ) -> (record: NotificationKeyRecord, payload: NotificationPayload)? {
        guard let envelopeText = userInfo["envelope"] as? String else { return nil }
        let envelope = Data(envelopeText.utf8)
        guard let kid = peekKeyID(in: envelope),
            let record = keys.first(where: { $0.keyID == kid }),
            let payload = try? decrypt(envelope, using: record.key)
        else { return nil }
        return (record, payload)
    }

    /// Decrypts an envelope's wire bytes with a Notification Key.
    ///
    /// Every way an envelope can be undecryptable — malformed framing, a
    /// future version, tampered or wrongly keyed ciphertext, a garbage
    /// plaintext — surfaces as a typed `NotificationEnvelopeError` so the
    /// service extension can fall back to a generic banner; nothing here
    /// crashes on hostile input.
    static func decrypt(
        _ envelope: Data, using key: Data
    ) throws(NotificationEnvelopeError) -> NotificationPayload {
        let plaintext = try SealedEnvelopeCodec.open(
            envelope, using: key, authenticating: additionalData)
        return try validated(plaintext)
    }

    private static func validated(
        _ plaintext: Data
    ) throws(NotificationEnvelopeError) -> NotificationPayload {
        let wire: WirePlaintext
        do {
            wire = try JSONDecoder().decode(WirePlaintext.self, from: plaintext)
        } catch {
            throw .badPayload(reason: "plaintext is not a well-formed JSON object")
        }
        guard let pane = wire.pane, !pane.isEmpty else {
            throw .badPayload(reason: "pane must be a non-empty string")
        }
        guard let kind = wire.kind, !kind.isEmpty else {
            throw .badPayload(reason: "kind must be a non-empty string")
        }
        guard let status = wire.status, !status.isEmpty else {
            throw .badPayload(reason: "status must be a non-empty string")
        }
        guard let rawTimestamp = wire.ts, let timestamp = Int(exactly: rawTimestamp),
            timestamp > 0
        else {
            throw .badPayload(reason: "ts must be a positive unix-seconds integer")
        }
        // Display-only and additive: a payload without them still renders,
        // one step less specific. Empty strings mean "the Host had nothing",
        // which is the same thing as absent.
        return NotificationPayload(
            paneID: pane, agentKind: kind, status: AgentStatus(rawValue: status),
            timestamp: Date(timeIntervalSince1970: TimeInterval(timestamp)),
            project: nonEmpty(wire.project), title: nonEmpty(wire.title),
            approval: try approval(in: wire))
    }

    /// The approval fields, nil without an episode id: nothing could be
    /// spent or bound without one. Mistyped fields fail the whole payload,
    /// like the core fields do.
    private static func approval(
        in wire: WirePlaintext
    ) throws(NotificationEnvelopeError) -> ApprovalPreview? {
        let options = wire.opts ?? []
        guard options.count <= approvalOptionsLimit else {
            throw .badPayload(reason: "opts must hold at most \(approvalOptionsLimit) labels")
        }
        var flag: Int?
        if let act = wire.act {
            guard let value = Int(exactly: act) else { throw .badPayload(reason: "act must be an integer") }
            flag = value
        }
        guard let episodeID = nonEmpty(wire.bid) else { return nil }
        // 1 is Approve and Deny, 2 Deny only; anything else is a hint this
        // build does not know, so no buttons.
        return ApprovalPreview(
            episodeID: episodeID, isApprovable: flag == 1 || flag == 2, isDenyOnly: flag == 2,
            prompt: nonEmpty(wire.q), options: options.filter { !$0.isEmpty })
    }

    private static func nonEmpty(_ text: String?) -> String? {
        guard let text, !text.isEmpty else { return nil }
        return text
    }

    /// Decrypted JSON wire shape, lenient for the same reason. `project` and
    /// `title` are the additive v1 display fields: absent from older plugins,
    /// and never load-bearing for anything but copy. `bid`, `act`, `q` and
    /// `opts` are the additive approval fields (spec F5).
    private struct WirePlaintext: Decodable {
        var pane: String?
        var kind: String?
        var status: String?
        var ts: Double?
        var project: String?
        var title: String?
        var bid: String?
        var act: Double?
        var q: String?
        var opts: [String]?
    }
}

/// Why an envelope did not yield a payload. These map 1:1 to the error
/// identifiers in the shared test vectors. Any of them means the service
/// extension shows the generic fallback banner instead of decrypted content.
enum NotificationEnvelopeError: Error, Sendable, Equatable {
    /// The cleartext framing is broken: not a JSON object, or a missing or
    /// mistyped field.
    case badEnvelope(reason: String)
    /// An envelope from a plugin speaking another contract version.
    case unsupportedVersion(found: Int)
    /// GCM authentication failed: tampered material or the wrong key.
    case decryptFailed
    /// The ciphertext opened but its plaintext violates the payload schema.
    case badPayload(reason: String)

    /// The cross-implementation identifier used by the shared test vectors.
    var wireCode: String {
        switch self {
        case .badEnvelope: "bad_envelope"
        case .unsupportedVersion: "unsupported_version"
        case .decryptFailed: "decrypt_failed"
        case .badPayload: "bad_payload"
        }
    }
}
