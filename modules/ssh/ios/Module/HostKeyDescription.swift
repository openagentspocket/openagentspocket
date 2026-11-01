import CryptoKit
import Foundation

/// What JavaScript sees of a Host Key: its algorithm and its OpenSSH SHA-256
/// fingerprint, the string the user confirms on first connect (TOFU) and the
/// app pins afterwards.
struct HostKeyDescription: Sendable, Equatable {
    /// The algorithm named by the blob's first string, or `*` when unreadable.
    let algorithm: String
    /// `SHA256:<base64 without padding>`, as `ssh-keygen -l` prints it.
    let fingerprint: String

    init(publicKeyBlob: Data) {
        let digest = Data(SHA256.hash(data: publicKeyBlob))
        fingerprint = "SHA256:" + digest.base64EncodedString().trimmingCharacters(in: ["="])
        algorithm = Self.readAlgorithm(from: publicKeyBlob) ?? "*"
    }

    private static func readAlgorithm(from blob: Data) -> String? {
        let bytes = [UInt8](blob)
        guard bytes.count >= 4 else { return nil }
        let length = bytes[0..<4].reduce(0) { ($0 << 8) | Int($1) }
        guard length > 0, length <= 256, bytes.count >= 4 + length else { return nil }
        guard let algorithm = String(bytes: bytes[4..<(4 + length)], encoding: .utf8) else {
            return nil
        }
        return algorithm.unicodeScalars.allSatisfy { $0.isASCII && !$0.properties.isWhitespace }
            ? algorithm : nil
    }
}
