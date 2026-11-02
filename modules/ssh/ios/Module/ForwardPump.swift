import Foundation
@preconcurrency import Network

/// One accepted loopback connection, as the pump sees it. Cancelling the
/// connection ends pending receives and sends.
final class ForwardedSocket: Sendable {
    private let connection: NWConnection
    private let reachedEOF = Locked(false)

    init(_ connection: NWConnection, queue: DispatchQueue) {
        self.connection = connection
        connection.stateUpdateHandler = { [weak connection] state in
            switch state {
            case .failed, .waiting: connection?.cancel()
            case .cancelled: connection?.stateUpdateHandler = nil
            default: break
            }
        }
        connection.start(queue: queue)
    }

    /// The next bytes from the local peer, or nil once it half-closed.
    func receive(maximumBytes: Int) async throws -> Data? {
        if reachedEOF.withLock({ $0 }) { return nil }
        let connection = connection
        let reachedEOF = reachedEOF
        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation {
                (continuation: CheckedContinuation<Data?, any Error>) in
                connection.receive(minimumIncompleteLength: 1, maximumLength: maximumBytes) {
                    data, _, isComplete, error in
                    if let data, !data.isEmpty {
                        // A FIN may arrive with the peer's last bytes; those go first.
                        if isComplete { reachedEOF.withLock { $0 = true } }
                        continuation.resume(returning: data)
                    } else if let error {
                        continuation.resume(throwing: error)
                    } else if isComplete {
                        reachedEOF.withLock { $0 = true }
                        continuation.resume(returning: nil)
                    } else {
                        continuation.resume(returning: Data())
                    }
                }
            }
        } onCancel: {
            connection.cancel()
        }
    }

    /// Returns once the local TCP stack took the bytes (the backpressure).
    func send(_ data: Data) async throws {
        try await completeSend(data, isComplete: false)
    }

    /// Half-closes: the local peer reads EOF and may keep sending.
    func sendEOF() async throws {
        try await completeSend(nil, isComplete: true)
    }

    func cancel() {
        connection.cancel()
    }

    private func completeSend(_ data: Data?, isComplete: Bool) async throws {
        let connection = connection
        try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation {
                (continuation: CheckedContinuation<Void, any Error>) in
                connection.send(
                    content: data,
                    contentContext: isComplete ? .finalMessage : .defaultMessage,
                    isComplete: isComplete,
                    completion: .contentProcessed { error in
                        if let error {
                            continuation.resume(throwing: error)
                        } else {
                            continuation.resume()
                        }
                    })
            }
        } onCancel: {
            connection.cancel()
        }
    }
}

/// Moves bytes between one loopback connection and one direct-tcpip channel,
/// both ways, one chunk per direction at a time: each direction awaits its
/// write before it reads again, so either slow side holds the other back.
/// An EOF on one side becomes an EOF on the other; a failure on either side
/// ends both. The caller closes both ends once it returns.
enum ForwardPump {
    static let chunkSize = 64 * 1024
    static let writeTimeout: Duration = .seconds(30)
    static let readPollTimeout: Duration = .seconds(15)

    static func run(local: ForwardedSocket, remote: SSHTCPChannel) async {
        await withTaskGroup(of: Bool.self) { group in
            group.addTask { (try? await upstream(local: local, remote: remote)) != nil }
            group.addTask { (try? await downstream(local: local, remote: remote)) != nil }
            for await finished in group where !finished {
                group.cancelAll()
                local.cancel()
            }
        }
    }

    /// Local peer to the Host server.
    private static func upstream(local: ForwardedSocket, remote: SSHTCPChannel) async throws {
        while true {
            try Task.checkCancellation()
            guard let data = try await local.receive(maximumBytes: chunkSize) else {
                try await remote.sendEOF(timeout: .seconds(5))
                return
            }
            if !data.isEmpty { try await remote.write(data, timeout: writeTimeout) }
        }
    }

    /// Host server to the local peer.
    private static func downstream(local: ForwardedSocket, remote: SSHTCPChannel) async throws {
        while true {
            try Task.checkCancellation()
            let data: Data?
            do {
                data = try await remote.read(maximumBytes: chunkSize, timeout: readPollTimeout)
            } catch SSHError.timedOut {
                continue  // A timed-out read leaves the channel readable.
            }
            guard let data else {
                try await local.sendEOF()
                return
            }
            if !data.isEmpty { try await local.send(data) }
        }
    }
}
