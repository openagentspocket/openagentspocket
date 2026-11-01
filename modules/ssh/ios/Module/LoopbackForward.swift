import Foundation
@preconcurrency import Network

/// A listener on `127.0.0.1` whose every accepted connection gets its own
/// direct-tcpip channel to one target on the Host, bytes pumped both ways
/// (the phone side of a Ports preview).
///
/// - Loopback only: bound to `127.0.0.1` and the loopback interface, so
///   Wi-Fi and cellular peers cannot connect.
/// - At most `maxLiveConnections` connections hold a channel at once; any
///   excess is refused (closed) rather than queued.
/// - `stop` cancels the listener and every live connection; idempotent.
final class LoopbackForward: Sendable {
    static let maxLiveConnections = 8
    static let channelOpenTimeout: Duration = .seconds(10)

    private struct State {
        var live: [UInt64: Task<Void, Never>] = [:]
        var ended: Set<UInt64> = []
        var next: UInt64 = 0
        var stopped = false
    }

    let port: UInt16
    private let listener: NWListener
    private let state = Locked(State())

    private init(listener: NWListener, port: UInt16) {
        self.listener = listener
        self.port = port
    }

    static func start(connection: SSHConnection, target: SSHTCPTarget) async throws
        -> LoopbackForward
    {
        let parameters = NWParameters.tcp
        parameters.requiredLocalEndpoint = .hostPort(host: .ipv4(.loopback), port: .any)
        parameters.requiredInterfaceType = .loopback
        parameters.allowLocalEndpointReuse = false
        let listener = try NWListener(using: parameters)
        let queue = DispatchQueue(label: "agentico.ssh.forward")
        let ready = Locked<CheckedContinuation<UInt16, any Error>?>(nil)
        let box = Locked<LoopbackForward?>(nil)
        let finish: @Sendable (Result<UInt16, any Error>) -> Void = { result in
            ready.take()?.resume(with: result)
        }

        let port = try await withCheckedThrowingContinuation {
            (continuation: CheckedContinuation<UInt16, any Error>) in
            ready.withLock { $0 = continuation }
            listener.newConnectionHandler = { incoming in
                guard let forward = box.withLock({ $0 }) else {
                    incoming.cancel()
                    return
                }
                forward.accept(incoming, connection: connection, target: target, queue: queue)
            }
            listener.stateUpdateHandler = { [weak listener] state in
                switch state {
                case .ready:
                    if let port = listener?.port?.rawValue {
                        finish(.success(port))
                    } else {
                        finish(.failure(BridgeError.forwardFailed("no port")))
                    }
                case .failed(let error), .waiting(let error):
                    finish(.failure(BridgeError.forwardFailed(error.localizedDescription)))
                    listener?.cancel()
                case .cancelled:
                    finish(.failure(BridgeError.forwardFailed("cancelled")))
                    listener?.stateUpdateHandler = nil
                    listener?.newConnectionHandler = nil
                default:
                    break
                }
            }
            listener.start(queue: queue)
            queue.asyncAfter(deadline: .now() + .seconds(3)) {
                finish(.failure(BridgeError.forwardFailed("start timed out")))
            }
        }
        let forward = LoopbackForward(listener: listener, port: port)
        box.withLock { $0 = forward }
        return forward
    }

    func stop() {
        let live = state.withLock { state -> [Task<Void, Never>] in
            state.stopped = true
            let tasks = Array(state.live.values)
            state.live = [:]
            return tasks
        }
        listener.cancel()
        for task in live { task.cancel() }
    }

    private func accept(
        _ incoming: NWConnection,
        connection: SSHConnection,
        target: SSHTCPTarget,
        queue: DispatchQueue
    ) {
        let local = ForwardedSocket(incoming, queue: queue)
        let admitted: UInt64? = state.withLock { state in
            guard !state.stopped, state.live.count < Self.maxLiveConnections else { return nil }
            state.next += 1
            return state.next
        }
        guard let id = admitted else {
            local.cancel()
            return
        }
        let task = Task { [state] in
            defer {
                local.cancel()
                state.withLock { state in
                    // A task that ends before it was registered leaves a mark instead.
                    if state.live.removeValue(forKey: id) == nil { state.ended.insert(id) }
                }
            }
            guard
                let channel = try? await connection.openTCPChannel(
                    to: target, timeout: Self.channelOpenTimeout)
            else { return }
            await ForwardPump.run(local: local, remote: channel)
            try? await channel.close(timeout: .seconds(2))
        }
        state.withLock { state in
            if state.ended.remove(id) != nil { return }
            if state.stopped { task.cancel() } else { state.live[id] = task }
        }
    }
}
