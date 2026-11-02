import ExpoModulesCore
import Foundation

/// Failures the bridge itself raises (ids JavaScript holds that native no
/// longer knows, keys that were never generated, bad arguments).
enum BridgeError: Error {
    /// The session, stream, SFTP client or forward id is unknown: it was
    /// closed, or never existed.
    case closed
    case keyNotFound
    case invalidArgument(String)
    case forwardFailed(String)
}

/// Maps every native failure to a stable code JavaScript switches on (the
/// `SshErrorCode` union in src/errors.ts). Messages never carry paths or keys.
enum BridgeErrorCode {
    static func of(_ error: any Error) -> String {
        switch error {
        case let error as SSHError:
            return of(ssh: error)
        case let error as DeviceKeyStore.Failure:
            switch error {
            case .storedKeyCorrupt: return "keyCorrupt"
            case .keychain: return "keychainFailed"
            }
        case let error as RSAPrivateKey.Failure:
            switch error {
            case .invalid: return "keyInvalid"
            case .encrypted: return "keyEncrypted"
            }
        case let error as BridgeError:
            switch error {
            case .closed: return "closed"
            case .keyNotFound: return "keyNotFound"
            case .invalidArgument: return "invalidArgument"
            case .forwardFailed: return "forwardFailed"
            }
        case is CancellationError:
            return "cancelled"
        default:
            return "unknown"
        }
    }

    private static func of(ssh error: SSHError) -> String {
        switch error {
        case .invalidEndpoint: "invalidEndpoint"
        case .connectionFailed: "connectionFailed"
        case .algorithmNegotiationFailed: "algorithmNegotiationFailed"
        case .authenticationFailed: "authenticationFailed"
        case .timedOut: "timedOut"
        case .cancelled: "cancelled"
        case .channelFailed: "channelFailed"
        case .forwardingDenied: "forwardingDenied"
        case .targetUnreachable: "targetUnreachable"
        case .streamLocalOpenFailed: "streamLocalOpenFailed"
        case .unexpectedEOF: "unexpectedEOF"
        case .responseTooLarge: "responseTooLarge"
        case .sftpUnavailable: "sftpUnavailable"
        case .sftpFailure: "sftpFailure"
        case .connectionInvalidated: "connectionInvalidated"
        }
    }

    static func message(_ error: any Error) -> String {
        switch error {
        case SSHError.responseTooLarge(let limit): "response over \(limit) bytes"
        case SSHError.sftpFailure(let status): "SFTP status \(status)"
        case BridgeError.invalidArgument(let what): "invalid \(what)"
        case BridgeError.forwardFailed(let why): "local listener failed: \(why)"
        case DeviceKeyStore.Failure.keychain(let status): "Keychain status \(status)"
        default: of(error)
        }
    }

    static func exception(_ error: any Error) -> Exception {
        if let exception = error as? Exception { return exception }
        return Exception(name: "SshError", description: message(error), code: of(error))
    }
}

/// Runs one bridged call, turning any failure into a coded Expo exception.
func bridged<T>(_ body: () async throws -> T) async throws -> T {
    do {
        return try await body()
    } catch {
        throw BridgeErrorCode.exception(error)
    }
}

func bridgedSync<T>(_ body: () throws -> T) throws -> T {
    do {
        return try body()
    } catch {
        throw BridgeErrorCode.exception(error)
    }
}

extension Duration {
    /// A JavaScript timeout in milliseconds, clamped to at least 1 ms.
    static func ms(_ milliseconds: Int) -> Duration {
        .milliseconds(max(1, milliseconds))
    }
}
