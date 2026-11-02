import Foundation

/// Decrypted Live Activity details: the Host's short name plus the capped
/// agent list in the sender's pin-aware order, rendered as given
/// (docs/agents/live-activity-contract.md).
struct AgentActivityDetails: Sendable, Equatable {
    var hostName: String
    var agents: [AgentDetail]

    struct Field: Codable, Sendable, Equatable {
        var text: String
        var fg: String? = nil
        var bold: Bool? = nil
        var dim: Bool? = nil
    }

    struct AgentDetail: Sendable, Equatable {
        var paneID: String
        var kind: String
        /// The herdr agent name (`display_agent ?? name`); nil when unnamed.
        var name: String? = nil
        /// The herdr workspace label; nil when an older producer did not
        /// include one or the workspace is unavailable.
        var workspace: String? = nil
        var status: String
        var title: String?
        /// Rendered Agent List Fields. Nil retains the legacy identity layout.
        var rows: [[Field]]? = nil
        /// The prompt a Blocked Agent waits on, when this device approves
        /// from outside the app for the Host (spec F5, R5). Nil otherwise,
        /// and for a malformed `ask`, which never fails the update.
        var ask: ActivityApprovalAsk? = nil

        /// Notification surfaces intentionally use one identity everywhere,
        /// independent of terminal titles and custom Agent names.
        var displayIdentity: String {
            AgentNotificationIdentity.title(workspace: workspace, kind: kind)
        }

        /// The Live Activity's primary label. Older producers may omit it;
        /// the row then promotes the friendly Agent kind instead.
        var displayWorkspace: String? { Self.nonEmpty(workspace) }

        private static func nonEmpty(_ text: String?) -> String? {
            guard let text, !text.isEmpty else { return nil }
            return text
        }
    }
}

/// Why an activity envelope did not yield details. Same identifiers as
/// `NotificationEnvelopeError` so the shared vectors can name either side.
enum AgentActivityEnvelopeError: Error, Sendable, Equatable {
    /// The cleartext framing is broken: not a JSON object, or a missing or
    /// mistyped field.
    case badEnvelope(reason: String)
    /// An envelope from a plugin speaking another contract version.
    case unsupportedVersion(found: Int)
    /// GCM authentication failed: tampered material, the wrong key, or the
    /// wrong AAD (a notification ciphertext opened as an activity envelope).
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

/// Live Activity details envelope v1. Same AES-256-GCM `{v,kid,n,ct}`
/// framing and kid derivation as the notification envelope, bound to AAD
/// `HERDR-ACTIVITY:1` so the two domains cannot open each other's
/// ciphertext. Shared vectors live in
/// `plugin/test-vectors/live-activity-content-v1.json`.
enum AgentActivityEnvelope {
    static let version = 1

    private static var additionalData: Data {
        Data("HERDR-ACTIVITY:\(version)".utf8)
    }

    static func keyID(for key: Data) -> String {
        SealedEnvelopeCodec.keyID(for: key)
    }

    /// Decrypts an activity envelope's wire bytes with a Notification Key.
    static func open(
        _ envelope: Data, using key: Data
    ) throws(AgentActivityEnvelopeError) -> AgentActivityDetails {
        let plaintext: Data
        do {
            plaintext = try SealedEnvelopeCodec.open(
                envelope, using: key, authenticating: additionalData)
        } catch {
            throw mapFrameError(error)
        }
        return try validated(plaintext)
    }

    /// Encrypts details into the canonical v1 envelope. `nonce` is
    /// injectable so shared vectors can assert the exact wire string;
    /// production callers omit it.
    static func seal(
        _ details: AgentActivityDetails, using key: Data, nonce: Data? = nil
    ) throws -> Data {
        try SealedEnvelopeCodec.seal(
            encodePlaintext(details), using: key, authenticating: additionalData,
            nonce: nonce)
    }

    private static func mapFrameError(
        _ error: NotificationEnvelopeError
    ) -> AgentActivityEnvelopeError {
        switch error {
        case .badEnvelope(let reason): .badEnvelope(reason: reason)
        case .unsupportedVersion(let found): .unsupportedVersion(found: found)
        case .decryptFailed: .decryptFailed
        case .badPayload(let reason): .badPayload(reason: reason)
        }
    }

    private static func validated(
        _ plaintext: Data
    ) throws(AgentActivityEnvelopeError) -> AgentActivityDetails {
        let wire: WirePlaintext
        do {
            wire = try JSONDecoder().decode(WirePlaintext.self, from: plaintext)
        } catch {
            throw .badPayload(reason: "plaintext is not a well-formed JSON object")
        }
        guard let rawVersion = wire.v, let foundVersion = Int(exactly: rawVersion) else {
            throw .badPayload(reason: "v must be an integer")
        }
        guard foundVersion == version else {
            throw .badPayload(reason: "unsupported payload version \(foundVersion)")
        }
        guard let host = wire.host, !host.isEmpty else {
            throw .badPayload(reason: "host must be a non-empty string")
        }
        guard let wireAgents = wire.agents else {
            throw .badPayload(reason: "agents must be an array")
        }
        var agents: [AgentActivityDetails.AgentDetail] = []
        agents.reserveCapacity(wireAgents.count)
        for item in wireAgents {
            guard let pane = item.pane, !pane.isEmpty else {
                throw .badPayload(reason: "pane must be a non-empty string")
            }
            guard let kind = item.kind, !kind.isEmpty else {
                throw .badPayload(reason: "kind must be a non-empty string")
            }
            guard let status = item.status, !status.isEmpty else {
                throw .badPayload(reason: "status must be a non-empty string")
            }
            agents.append(
                AgentActivityDetails.AgentDetail(
                    paneID: pane, kind: kind, name: nonEmpty(item.name),
                    workspace: nonEmpty(item.workspace), status: status,
                    title: nonEmpty(item.title), rows: item.rows, ask: item.ask?.value))
        }
        return AgentActivityDetails(hostName: host, agents: agents)
    }

    /// Canonical plaintext: compact JSON, keys sorted at every level, agents
    /// in the caller-supplied contract order and capped at 5. Title is
    /// omitted when absent or empty. This does not re-sort: pin-aware order
    /// is established by the producer and must survive sealing.
    private static func encodePlaintext(_ details: AgentActivityDetails) throws -> Data {
        let agents = Array(details.agents.prefix(5)).map { agent in
            OutgoingAgent(
                ask: agent.ask.map(OutgoingAsk.init),
                kind: agent.kind, name: nonEmpty(agent.name), pane: agent.paneID,
                rows: agent.rows, status: agent.status, title: nonEmpty(agent.title),
                workspace: nonEmpty(agent.workspace))
        }
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        return try encoder.encode(
            OutgoingPlaintext(agents: agents, host: details.hostName, v: version))
    }

    private static func nonEmpty(_ text: String?) -> String? {
        guard let text, !text.isEmpty else { return nil }
        return text
    }

    /// Decrypted JSON wire shape. Every field is optional so missing keys
    /// and wrong types surface as `badPayload` after decoding.
    private struct WirePlaintext: Decodable {
        var v: Double?
        var host: String?
        var agents: [WireAgent]?
    }

    private struct WireAgent: Decodable {
        var pane: String?
        var kind: String?
        var name: String?
        var status: String?
        var title: String?
        var workspace: String?
        var rows: [[AgentActivityDetails.Field]]?
        var ask: LenientAsk?
    }

    /// `ask` decoded leniently: a malformed one drops only the buttons,
    /// never the agent or the update.
    private struct LenientAsk: Decodable {
        let value: ActivityApprovalAsk?

        init(from decoder: any Decoder) throws {
            guard let wire = try? WireAsk(from: decoder), let bid = wire.bid, !bid.isEmpty,
                let act = wire.act.flatMap({ Int(exactly: $0) }), act == 1 || act == 2,
                let q = wire.q, !q.isEmpty,
                let ts = wire.ts.flatMap({ Int(exactly: $0) }), ts > 0
            else {
                value = nil
                return
            }
            let options = wire.opts ?? []
            guard options.count <= NotificationEnvelope.approvalOptionsLimit else {
                value = nil
                return
            }
            value = ActivityApprovalAsk(
                episodeID: bid, isDenyOnly: act == 2, prompt: q, options: options.filter { !$0.isEmpty },
                timestamp: ts, result: wire.res.flatMap(ActivityApprovalResult.init(rawValue:)))
        }
    }

    private struct WireAsk: Decodable {
        var act: Double?
        var bid: String?
        var opts: [String]?
        var q: String?
        var res: String?
        var ts: Double?
    }

    /// Canonical `ask`: `act` < `bid` < `opts` < `q` < `res` < `ts`, `res`
    /// only when set.
    private struct OutgoingAsk: Encodable {
        var act: Int
        var bid: String
        var opts: [String]
        var q: String
        var res: String?
        var ts: Int

        init(_ ask: ActivityApprovalAsk) {
            act = ask.actionFlag
            bid = ask.episodeID
            opts = ask.options
            q = ask.prompt
            res = ask.result?.rawValue
            ts = ask.timestamp
        }
    }

    private struct OutgoingPlaintext: Encodable {
        var agents: [OutgoingAgent]
        var host: String
        var v: Int
    }

    private struct OutgoingAgent: Encodable {
        var ask: OutgoingAsk?
        var kind: String
        var name: String?
        var pane: String
        var rows: [[AgentActivityDetails.Field]]?
        var status: String
        var title: String?
        var workspace: String?
    }
}
