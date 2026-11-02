import Foundation

/// The operations behind the module's functions. Bytes cross to JavaScript as
/// base64; ids name every native object. Host Key policy (pinning, TOFU) runs
/// in JavaScript between `connect` and `authenticate`, so authentication never
/// begins before the key was accepted.
final class SSHBridge: Sendable {
    let registry = BridgeRegistry()
    /// The event callback in a class box. Stored bare in `Locked<Value>`, every `withLock` access
    /// reabstracts the closure and writes it back wrapped in two more thunks, so the chain grows with
    /// each event and a flood overflowed the stack (about 5,000 nested thunks).
    private final class Sink: Sendable {
        let call: @Sendable (BridgeEvent) -> Void
        init(_ call: @escaping @Sendable (BridgeEvent) -> Void) { self.call = call }
    }
    private let sink = Locked<Sink?>(nil)
    private let keys = DeviceKeyStore()

    func setSink(_ sink: @escaping @Sendable (BridgeEvent) -> Void) {
        let box = Sink(sink)
        self.sink.withLock { $0 = box }
    }

    func emit(_ event: BridgeEvent) {
        sink.withLock { $0 }?.call(event)
    }

    // MARK: Device keys

    func generateKey(alias: String) throws -> String {
        DeviceKeyFormat.openSSHLine(try keys.loadOrCreate(alias: alias))
    }

    func publicKey(alias: String) throws -> String? {
        try keys.load(alias: alias).map(DeviceKeyFormat.openSSHLine)
    }

    func deleteKey(alias: String) throws {
        try keys.delete(alias: alias)
    }

    // MARK: Connections

    /// Handshake only: the caller verifies the returned Host Key, then calls
    /// `authenticate` (or `disconnect`).
    func connect(host: String, port: Int, timeout: Duration) async throws -> [String: Any?] {
        guard !host.isEmpty, let port = UInt16(exactly: port), port > 0 else {
            throw SSHError.invalidEndpoint
        }
        let connection = try await SSHConnection.connect(
            to: SSHEndpoint(host: host, port: port), timeout: timeout)
        let hostKey = HostKeyDescription(publicKeyBlob: connection.hostKey.key)
        let sessionId = await registry.add(connection: connection)
        return [
            "sessionId": sessionId,
            "hostKeyAlgorithm": hostKey.algorithm,
            "hostKeyFingerprint": hostKey.fingerprint,
            "hostKey": connection.hostKey.key.base64EncodedString(),
            "serverIdentification": connection.serverIdentification,
        ]
    }

    /// Public-key authentication with the device key under `keyAlias`. The
    /// private key signs inside this process and never leaves it.
    func authenticate(sessionId: String, username: String, keyAlias: String, timeout: Duration)
        async throws
    {
        let connection = try await registry.connection(sessionId)
        guard let key = try keys.load(alias: keyAlias) else { throw BridgeError.keyNotFound }
        try await connection.authenticate(
            username: username,
            publicKey: DeviceKeyFormat.publicKeyBlob(key),
            signer: { data in try key.signature(for: data) },
            timeout: timeout)
    }

    /// Closes the connection and everything opened on it. Idempotent.
    func disconnect(sessionId: String) async {
        guard let (connection, children) = await registry.removeConnection(sessionId) else { return }
        for forward in children.forwards { forward.stop() }
        for stream in children.streams {
            stream.pump?.cancel()
            emit(.closed(streamId: stream.id, reason: "disconnected", exitStatus: nil))
        }
        for client in children.sftpClients { try? await client.close(timeout: .seconds(1)) }
        try? await connection.close(timeout: .seconds(2))
    }

    func disconnectAll() async {
        for id in await registry.allConnectionIDs() { await disconnect(sessionId: id) }
    }

    func isConnected(sessionId: String) async -> Bool {
        guard let connection = try? await registry.connection(sessionId) else { return false }
        return await connection.isConnected
    }

    // MARK: One-shot requests

    func exec(sessionId: String, command: String, inputBase64: String?, timeout: Duration)
        async throws -> [String: Any]
    {
        let connection = try await registry.connection(sessionId)
        let input = try decode(inputBase64 ?? "")
        let result = try await connection.execute(command, input: input, timeout: timeout)
        return [
            "exitCode": Int(result.exitStatus),
            "stdout": String(decoding: result.stdout, as: UTF8.self),
            "stderr": String(decoding: result.stderr, as: UTF8.self),
        ]
    }

    /// One request on a fresh direct-streamlocal channel; the response is the
    /// first newline-terminated line, bounded by `maxResponseBytes`.
    func exchangeStreamLocal(
        sessionId: String,
        socketPath: String,
        requestBase64: String,
        maxResponseBytes: Int,
        timeout: Duration
    ) async throws -> String {
        let connection = try await registry.connection(sessionId)
        let response = try await connection.exchangeStreamLocal(
            socketPath: socketPath,
            request: try decode(requestBase64),
            maximumResponseBytes: max(1, maxResponseBytes),
            timeout: timeout)
        return response.base64EncodedString()
    }

    // MARK: Local forwards

    func startForward(sessionId: String, host: String, port: Int) async throws -> [String: Any] {
        let connection = try await registry.connection(sessionId)
        guard let port = UInt16(exactly: port), let target = SSHTCPTarget(address: host, port: port)
        else { throw BridgeError.invalidArgument("forward target") }
        let forward = try await LoopbackForward.start(connection: connection, target: target)
        do {
            let forwardId = try await registry.add(forward: forward, sessionId: sessionId)
            return ["forwardId": forwardId, "localPort": Int(forward.port)]
        } catch {
            forward.stop()
            throw error
        }
    }

    func stopForward(forwardId: String) async {
        await registry.removeForward(forwardId)?.stop()
    }

    func decode(_ base64: String) throws -> Data {
        guard let data = Data(base64Encoded: base64) else {
            throw BridgeError.invalidArgument("base64")
        }
        return data
    }
}
