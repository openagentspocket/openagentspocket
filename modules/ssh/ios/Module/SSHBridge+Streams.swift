import Foundation

/// Long-lived duplex channels. Opening registers the channel; reading starts
/// only at `startStream`, once JavaScript listens, so no early byte is lost
/// and an unread channel holds the server back through its window. Every
/// stream reports `closed` exactly once: at the remote EOF, on a failure, or
/// after `closeStream`.
extension SSHBridge {
    static let openTimeout: Duration = .seconds(10)
    /// One read waits this long, then reads again; not an idle limit.
    static let readPollTimeout: Duration = .seconds(30)

    func openStreamLocal(sessionId: String, socketPath: String, timeout: Duration) async throws
        -> String
    {
        let connection = try await registry.connection(sessionId)
        let channel = try await connection.openStreamLocal(socketPath: socketPath, timeout: timeout)
        return try await register(.streamLocal(channel), sessionId: sessionId)
    }

    /// A PTY running `command` directly (no login shell is implied).
    func openPty(
        sessionId: String,
        command: String,
        term: String,
        cols: Int,
        rows: Int,
        timeout: Duration
    ) async throws -> String {
        guard cols > 0, rows > 0 else { throw BridgeError.invalidArgument("PTY size") }
        let connection = try await registry.connection(sessionId)
        let channel = try await connection.openPTY(
            command: command, terminal: term, columns: cols, rows: rows, timeout: timeout)
        return try await register(.pty(channel), sessionId: sessionId)
    }

    /// A direct-tcpip channel to a loopback, private or link-local address on
    /// the Host (never a hostname or a public address).
    func openTcp(sessionId: String, host: String, port: Int, timeout: Duration) async throws
        -> String
    {
        guard let port = UInt16(exactly: port), let target = SSHTCPTarget(address: host, port: port)
        else { throw BridgeError.invalidArgument("TCP target") }
        let connection = try await registry.connection(sessionId)
        let channel = try await connection.openTCPChannel(to: target, timeout: timeout)
        return try await register(.tcp(channel), sessionId: sessionId)
    }

    func startStream(streamId: String) async throws {
        _ = try await registry.installPump(streamId) { channel in
            Task.detached { [self] in await self.pump(streamId: streamId, channel: channel) }
        }
    }

    func writeStream(streamId: String, base64: String, timeout: Duration) async throws {
        let data = try decode(base64)
        try await registry.channel(streamId).write(data, timeout: timeout)
    }

    func resizePty(streamId: String, cols: Int, rows: Int, timeout: Duration) async throws {
        guard cols > 0, rows > 0 else { throw BridgeError.invalidArgument("PTY size") }
        guard case .pty(let channel) = try await registry.channel(streamId) else {
            throw BridgeError.invalidArgument("stream kind")
        }
        try await channel.resize(columns: cols, rows: rows, timeout: timeout)
    }

    /// Closes one stream. Idempotent: an unknown id is already closed.
    func closeStream(streamId: String) async {
        guard let (channel, pump) = await registry.removeStream(streamId) else { return }
        pump?.cancel()
        try? await channel.close(timeout: .seconds(2))
        emit(.closed(streamId: streamId, reason: nil, exitStatus: nil))
    }

    private func register(_ channel: BridgeChannel, sessionId: String) async throws -> String {
        do {
            return try await registry.add(channel: channel, sessionId: sessionId)
        } catch {
            try? await channel.close(timeout: .seconds(2))
            throw error
        }
    }

    private func pump(streamId: String, channel: BridgeChannel) async {
        var reason: String?
        while !Task.isCancelled {
            do {
                guard let chunk = try await channel.read(timeout: Self.readPollTimeout) else { break }
                if !chunk.isEmpty {
                    emit(.data(streamId: streamId, base64: chunk.base64EncodedString()))
                }
            } catch SSHError.timedOut {
                continue
            } catch {
                if !Task.isCancelled { reason = BridgeErrorCode.of(error) }
                break
            }
        }
        if Task.isCancelled { return }  // closeStream or disconnect owns the close.
        var exitStatus: Int32?
        if reason == nil, case .pty(let pty) = channel {
            exitStatus = try? await pty.exitStatus(timeout: .seconds(2))
        }
        guard await registry.removeStream(streamId) != nil else { return }
        try? await channel.close(timeout: .seconds(2))
        emit(.closed(streamId: streamId, reason: reason, exitStatus: exitStatus))
    }
}
