import Foundation

/// One long-lived duplex channel JavaScript holds as a stream.
enum BridgeChannel: Sendable {
    case pty(SSHPTYChannel)
    case streamLocal(SSHStreamLocalChannel)
    case tcp(SSHTCPChannel)

    static let chunkSize = 32 * 1024

    /// The next bytes, nil at the remote EOF; throws `SSHError.timedOut`
    /// when nothing arrived in time, which leaves the channel readable.
    func read(timeout: Duration) async throws -> Data? {
        switch self {
        case .pty(let channel): try await channel.read(maximumBytes: Self.chunkSize, timeout: timeout)
        case .streamLocal(let channel):
            try await channel.read(maximumBytes: Self.chunkSize, timeout: timeout)
        case .tcp(let channel): try await channel.read(maximumBytes: Self.chunkSize, timeout: timeout)
        }
    }

    func write(_ data: Data, timeout: Duration) async throws {
        switch self {
        case .pty(let channel): try await channel.write(data, timeout: timeout)
        case .streamLocal(let channel): try await channel.write(data, timeout: timeout)
        case .tcp(let channel): try await channel.write(data, timeout: timeout)
        }
    }

    func close(timeout: Duration) async throws {
        switch self {
        case .pty(let channel): try await channel.close(timeout: timeout)
        case .streamLocal(let channel): try await channel.close(timeout: timeout)
        case .tcp(let channel): try await channel.close(timeout: timeout)
        }
    }
}

/// What the bridge tells JavaScript about streams, as module events.
enum BridgeEvent: Sendable {
    case data(streamId: String, base64: String)
    case closed(streamId: String, reason: String?, exitStatus: Int32?)
}

/// Every native object JavaScript holds by id: connections, streams, SFTP
/// clients and local forwards. Only bookkeeping happens on this actor; the
/// SSH operations run outside it, so one slow call never queues the others.
/// Removing a connection hands back its children for the caller to close.
actor BridgeRegistry {
    struct Children: Sendable {
        var streams: [(id: String, channel: BridgeChannel, pump: Task<Void, Never>?)] = []
        var sftpClients: [SSHSFTPClient] = []
        var forwards: [LoopbackForward] = []
    }

    private struct StreamEntry {
        let sessionId: String
        let channel: BridgeChannel
        var pump: Task<Void, Never>?
    }

    private var counter: UInt64 = 0
    private var connections: [String: SSHConnection] = [:]
    private var streams: [String: StreamEntry] = [:]
    private var sftpClients: [String: (sessionId: String, client: SSHSFTPClient)] = [:]
    private var forwards: [String: (sessionId: String, forward: LoopbackForward)] = [:]

    private func nextID(_ prefix: String) -> String {
        counter += 1
        return "\(prefix)-\(counter)"
    }

    // MARK: Connections

    func add(connection: SSHConnection) -> String {
        let id = nextID("ssh")
        connections[id] = connection
        return id
    }

    func connection(_ id: String) throws -> SSHConnection {
        guard let connection = connections[id] else { throw BridgeError.closed }
        return connection
    }

    func removeConnection(_ id: String) -> (SSHConnection, Children)? {
        guard let connection = connections.removeValue(forKey: id) else { return nil }
        var children = Children()
        for (streamId, entry) in streams where entry.sessionId == id {
            streams[streamId] = nil
            children.streams.append((streamId, entry.channel, entry.pump))
        }
        for (sftpId, entry) in sftpClients where entry.sessionId == id {
            sftpClients[sftpId] = nil
            children.sftpClients.append(entry.client)
        }
        for (forwardId, entry) in forwards where entry.sessionId == id {
            forwards[forwardId] = nil
            children.forwards.append(entry.forward)
        }
        return (connection, children)
    }

    func allConnectionIDs() -> [String] { Array(connections.keys) }

    // MARK: Streams

    func add(channel: BridgeChannel, sessionId: String) throws -> String {
        guard connections[sessionId] != nil else { throw BridgeError.closed }
        let id = nextID("stream")
        streams[id] = StreamEntry(sessionId: sessionId, channel: channel)
        return id
    }

    func channel(_ id: String) throws -> BridgeChannel {
        guard let entry = streams[id] else { throw BridgeError.closed }
        return entry.channel
    }

    /// Installs the read pump once; false when one already runs.
    func installPump(_ id: String, _ makePump: (BridgeChannel) -> Task<Void, Never>) throws -> Bool {
        guard var entry = streams[id] else { throw BridgeError.closed }
        guard entry.pump == nil else { return false }
        entry.pump = makePump(entry.channel)
        streams[id] = entry
        return true
    }

    /// Whoever removes a stream first closes its channel and reports it.
    func removeStream(_ id: String) -> (channel: BridgeChannel, pump: Task<Void, Never>?)? {
        guard let entry = streams.removeValue(forKey: id) else { return nil }
        return (entry.channel, entry.pump)
    }

    // MARK: SFTP

    func add(sftp client: SSHSFTPClient, sessionId: String) throws -> String {
        guard connections[sessionId] != nil else { throw BridgeError.closed }
        let id = nextID("sftp")
        sftpClients[id] = (sessionId, client)
        return id
    }

    func sftp(_ id: String) throws -> SSHSFTPClient {
        guard let entry = sftpClients[id] else { throw BridgeError.closed }
        return entry.client
    }

    func removeSftp(_ id: String) -> SSHSFTPClient? {
        sftpClients.removeValue(forKey: id)?.client
    }

    // MARK: Forwards

    func add(forward: LoopbackForward, sessionId: String) throws -> String {
        guard connections[sessionId] != nil else { throw BridgeError.closed }
        let id = nextID("forward")
        forwards[id] = (sessionId, forward)
        return id
    }

    func removeForward(_ id: String) -> LoopbackForward? {
        forwards.removeValue(forKey: id)?.forward
    }
}
