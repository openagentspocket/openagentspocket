import Foundation

/// A package-owned direct-tcpip channel to a server on the Host (F6a).
///
/// Unlike `SSHConnection.connectThrough`, which hands the whole session to a
/// Jump Host forwarding pump, this channel is one of many on an ordinary
/// session: herdr channels, SFTP and other TCP channels keep working beside
/// it. Native pointers stay inside `SessionDriver`, and each read and write
/// takes a short turn on that driver, like `SSHStreamLocalChannel`.
///
/// - Backpressure: `write` returns only once every byte is inside the
///   channel, so a caller that awaits it before reading its source more
///   follows the server's window. Inbound, the server sends at most one
///   channel window (libssh2's default, 2 MiB) ahead of `read`.
/// - Half-close: `sendEOF` ends this side's output; `read` keeps returning
///   the server's bytes until it reports nil at the server's EOF.
/// - Failures: a read or write past its timeout, or cancelled, leaves the
///   channel usable unless a packet it started could not be finished, in
///   which case the session is invalidated (the rule every channel shares).
///   A refused open never invalidates the session.
public final class SSHTCPChannel: Sendable {
    private let id: UInt64
    private let driver: SessionDriver
    /// The validated address and port the server connected to.
    public let target: SSHTCPTarget

    init(id: UInt64, driver: SessionDriver, target: SSHTCPTarget) {
        self.id = id
        self.driver = driver
        self.target = target
    }

    /// Writes every byte of `data`, waiting on the server's window as needed.
    /// Throws `.channelFailed` after `sendEOF` or once the channel is closed.
    public func write(_ data: Data, timeout: Duration) async throws {
        try await driver.writeTCP(id: id, data: data, timeout: timeout)
    }

    /// Reads the next available bytes, or nil after the server's EOF. Waits
    /// up to `timeout` for the first byte and then throws `.timedOut`, which
    /// leaves the channel readable.
    public func read(
        maximumBytes: Int = 32 * 1024,
        timeout: Duration
    ) async throws -> Data? {
        try await driver.readTCP(id: id, maximumBytes: maximumBytes, timeout: timeout)
    }

    /// Half-closes the channel: the server sees EOF on its socket, and this
    /// side can still read its answer. Idempotent.
    public func sendEOF(timeout: Duration) async throws {
        try await driver.sendEOFTCP(id: id, timeout: timeout)
    }

    /// Closes only this channel. Idempotent.
    public func close(timeout: Duration) async throws {
        try await driver.closeTCP(id: id, timeout: timeout)
    }

    deinit {
        let id = id
        let driver = driver
        Task { try? await driver.closeTCP(id: id, timeout: .seconds(2)) }
    }
}
