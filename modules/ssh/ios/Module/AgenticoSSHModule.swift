import ExpoModulesCore
import Foundation

/// The Expo bridge over the AgenticoSSH package: device keys, connect +
/// authenticate, exec, direct-streamlocal (one-shot and duplex), PTY, SFTP
/// and direct-tcpip (duplex and loopback forward). JavaScript holds string
/// ids; bytes cross as base64; stream bytes arrive as `onStreamData` events.
/// Every failure rejects with a stable `code` (see src/errors.ts).
public final class AgenticoSSHModule: Module {
    private let bridge = SSHBridge()

    public func definition() -> ModuleDefinition {
        let bridge = self.bridge
        Name("AgenticoSSH")
        Events("onStreamData", "onStreamClose")

        OnCreate {
            bridge.setSink { [weak self] event in self?.send(event) }
        }
        OnDestroy {
            Task { await bridge.disconnectAll() }
        }

        AsyncFunction("generateKey") { (alias: String) throws -> String in
            try bridgedSync { try bridge.generateKey(alias: alias) }
        }
        AsyncFunction("publicKey") { (alias: String) throws -> String? in
            try bridgedSync { try bridge.publicKey(alias: alias) }
        }
        AsyncFunction("deleteKey") { (alias: String) throws in
            try bridgedSync { try bridge.deleteKey(alias: alias) }
        }

        AsyncFunction("connect") { (host: String, port: Int, timeoutMs: Int) async throws -> [String: Any?] in
            try await bridged { try await bridge.connect(host: host, port: port, timeout: .ms(timeoutMs)) }
        }
        AsyncFunction("authenticate") {
            (sessionId: String, username: String, keyAlias: String, timeoutMs: Int) async throws in
            try await bridged {
                try await bridge.authenticate(
                    sessionId: sessionId, username: username, keyAlias: keyAlias,
                    timeout: .ms(timeoutMs))
            }
        }
        AsyncFunction("authenticateWith") {
            (sessionId: String, username: String, kind: String, secret: String, timeoutMs: Int)
                async throws in
            try await bridged {
                try await bridge.authenticate(
                    sessionId: sessionId, username: username, kind: kind, secret: secret,
                    timeout: .ms(timeoutMs))
            }
        }
        AsyncFunction("disconnect") { (sessionId: String) async in
            await bridge.disconnect(sessionId: sessionId)
        }
        AsyncFunction("isConnected") { (sessionId: String) async -> Bool in
            await bridge.isConnected(sessionId: sessionId)
        }
        AsyncFunction("exec") {
            (sessionId: String, command: String, input: String?, timeoutMs: Int) async throws -> [String: Any] in
            try await bridged {
                try await bridge.exec(
                    sessionId: sessionId, command: command, inputBase64: input, timeout: .ms(timeoutMs))
            }
        }
        AsyncFunction("exchangeStreamLocal") {
            (sessionId: String, socketPath: String, request: String, maxBytes: Int, timeoutMs: Int) async throws
                -> String in
            try await bridged {
                try await bridge.exchangeStreamLocal(
                    sessionId: sessionId, socketPath: socketPath, requestBase64: request,
                    maxResponseBytes: maxBytes, timeout: .ms(timeoutMs))
            }
        }

        AsyncFunction("openStreamLocal") {
            (sessionId: String, socketPath: String, timeoutMs: Int) async throws -> String in
            try await bridged {
                try await bridge.openStreamLocal(
                    sessionId: sessionId, socketPath: socketPath, timeout: .ms(timeoutMs))
            }
        }
        AsyncFunction("openPty") {
            (sessionId: String, command: String, term: String, cols: Int, rows: Int, timeoutMs: Int) async throws
                -> String in
            try await bridged {
                try await bridge.openPty(
                    sessionId: sessionId, command: command, term: term, cols: cols, rows: rows,
                    timeout: .ms(timeoutMs))
            }
        }
        AsyncFunction("openTcp") {
            (sessionId: String, host: String, port: Int, timeoutMs: Int) async throws -> String in
            try await bridged {
                try await bridge.openTcp(sessionId: sessionId, host: host, port: port, timeout: .ms(timeoutMs))
            }
        }
        AsyncFunction("startStream") { (streamId: String) async throws in
            try await bridged { try await bridge.startStream(streamId: streamId) }
        }
        AsyncFunction("writeStream") { (streamId: String, data: String, timeoutMs: Int) async throws in
            try await bridged {
                try await bridge.writeStream(streamId: streamId, base64: data, timeout: .ms(timeoutMs))
            }
        }
        AsyncFunction("resizePty") { (streamId: String, cols: Int, rows: Int, timeoutMs: Int) async throws in
            try await bridged {
                try await bridge.resizePty(streamId: streamId, cols: cols, rows: rows, timeout: .ms(timeoutMs))
            }
        }
        AsyncFunction("closeStream") { (streamId: String) async in
            await bridge.closeStream(streamId: streamId)
        }

        AsyncFunction("startForward") { (sessionId: String, host: String, port: Int) async throws -> [String: Any] in
            try await bridged { try await bridge.startForward(sessionId: sessionId, host: host, port: port) }
        }
        AsyncFunction("stopForward") { (forwardId: String) async in
            await bridge.stopForward(forwardId: forwardId)
        }

        AsyncFunction("sftpOpen") { (sessionId: String, timeoutMs: Int) async throws -> String in
            try await bridged { try await bridge.sftpOpen(sessionId: sessionId, timeout: .ms(timeoutMs)) }
        }
        AsyncFunction("sftpClose") { (sftpId: String) async in
            await bridge.sftpClose(sftpId: sftpId)
        }
        AsyncFunction("sftpStat") {
            (sftpId: String, path: String, followSymlinks: Bool, timeoutMs: Int) async throws -> [String: Any?]? in
            try await bridged {
                try await bridge.sftpStat(
                    sftpId: sftpId, path: path, followSymlinks: followSymlinks, timeout: .ms(timeoutMs))
            }
        }
        AsyncFunction("sftpList") {
            (sftpId: String, path: String, query: [String: Any], timeoutMs: Int) async throws -> [String: Any]? in
            try await bridged {
                try await bridge.sftpList(sftpId: sftpId, path: path, query: query, timeout: .ms(timeoutMs))
            }
        }
        AsyncFunction("sftpRead") { (sftpId: String, path: String, timeoutMs: Int) async throws -> String? in
            try await bridged { try await bridge.sftpRead(sftpId: sftpId, path: path, timeout: .ms(timeoutMs)) }
        }
        AsyncFunction("sftpReadRange") {
            (sftpId: String, path: String, offset: Double, maxBytes: Int, timeoutMs: Int) async throws
                -> [String: Any?] in
            try await bridged {
                try await bridge.sftpReadRange(
                    sftpId: sftpId, path: path, offset: offset, maxBytes: maxBytes, timeout: .ms(timeoutMs))
            }
        }
        AsyncFunction("sftpWrite") {
            (sftpId: String, path: String, data: String, permissions: Int, timeoutMs: Int) async throws in
            try await bridged {
                try await bridge.sftpWrite(
                    sftpId: sftpId, path: path, base64: data, permissions: permissions,
                    timeout: .ms(timeoutMs))
            }
        }
        AsyncFunction("sftpRename") {
            (sftpId: String, from: String, to: String, overwrite: Bool, timeoutMs: Int) async throws in
            try await bridged {
                try await bridge.sftpRename(
                    sftpId: sftpId, from: from, to: to, overwrite: overwrite, timeout: .ms(timeoutMs))
            }
        }
        AsyncFunction("sftpUnlink") { (sftpId: String, path: String, timeoutMs: Int) async throws in
            try await bridged { try await bridge.sftpUnlink(sftpId: sftpId, path: path, timeout: .ms(timeoutMs)) }
        }
        AsyncFunction("sftpMkdir") { (sftpId: String, path: String, permissions: Int, timeoutMs: Int) async throws in
            try await bridged {
                try await bridge.sftpMkdir(
                    sftpId: sftpId, path: path, permissions: permissions, timeout: .ms(timeoutMs))
            }
        }
        AsyncFunction("sftpRmdir") { (sftpId: String, path: String, timeoutMs: Int) async throws in
            try await bridged { try await bridge.sftpRmdir(sftpId: sftpId, path: path, timeout: .ms(timeoutMs)) }
        }
        AsyncFunction("sftpChmod") { (sftpId: String, path: String, permissions: Int, timeoutMs: Int) async throws in
            try await bridged {
                try await bridge.sftpChmod(
                    sftpId: sftpId, path: path, permissions: permissions, timeout: .ms(timeoutMs))
            }
        }
    }

    private func send(_ event: BridgeEvent) {
        switch event {
        case .data(let streamId, let base64):
            sendEvent("onStreamData", ["streamId": streamId, "data": base64])
        case .closed(let streamId, let reason, let exitStatus):
            sendEvent(
                "onStreamClose",
                ["streamId": streamId, "reason": reason, "exitStatus": exitStatus.map { Int($0) }])
        }
    }
}
