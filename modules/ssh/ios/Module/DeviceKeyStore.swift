import CryptoKit
import Foundation
import Security

/// The device's Ed25519 SSH keys, one per alias. A private key's raw bytes live
/// only in the Keychain (this device only: never in a backup or iCloud
/// Keychain) and in the in-memory CryptoKit object while it signs; there is no
/// export path. JavaScript only ever sees the OpenSSH public key line.
struct DeviceKeyStore: Sendable {
    static let service = "agentico.ssh.device-keys"

    enum Failure: Error {
        /// The stored bytes no longer parse as an Ed25519 key. Surfaced, never
        /// silently regenerated: a new key would lock the user out of every
        /// Host that trusts the old one.
        case storedKeyCorrupt
        case keychain(OSStatus)
    }

    /// The key under `alias`, generated and stored on first use.
    func loadOrCreate(alias: String) throws -> Curve25519.Signing.PrivateKey {
        if let key = try load(alias: alias) { return key }
        let key = Curve25519.Signing.PrivateKey()
        var attributes = baseQuery(alias: alias)
        attributes[kSecValueData as String] = key.rawRepresentation
        attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(attributes as CFDictionary, nil)
        switch status {
        case errSecSuccess:
            return key
        case errSecDuplicateItem:
            // Another caller stored one first: theirs wins, never a replacement.
            guard let stored = try load(alias: alias) else { throw Failure.keychain(status) }
            return stored
        default:
            throw Failure.keychain(status)
        }
    }

    /// The key under `alias`, or nil when none was generated.
    func load(alias: String) throws -> Curve25519.Signing.PrivateKey? {
        var query = baseQuery(alias: alias)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        switch status {
        case errSecSuccess:
            guard
                let data = item as? Data,
                let key = try? Curve25519.Signing.PrivateKey(rawRepresentation: data)
            else { throw Failure.storedKeyCorrupt }
            return key
        case errSecItemNotFound:
            return nil
        default:
            throw Failure.keychain(status)
        }
    }

    /// Deletes the key under `alias`; deleting a missing key succeeds.
    func delete(alias: String) throws {
        let status = SecItemDelete(baseQuery(alias: alias) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw Failure.keychain(status)
        }
    }

    private func baseQuery(alias: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.service,
            kSecAttrAccount as String: alias,
        ]
    }
}

/// The public material of a device key in SSH formats.
enum DeviceKeyFormat {
    /// SSH wire-format public key blob (RFC 4253 section 6.6): `string
    /// "ssh-ed25519"` + `string <32 raw key bytes>`.
    static func publicKeyBlob(_ key: Curve25519.Signing.PrivateKey) -> Data {
        var blob = Data()
        appendSSHString(Data("ssh-ed25519".utf8), to: &blob)
        appendSSHString(key.publicKey.rawRepresentation, to: &blob)
        return blob
    }

    /// The public key in OpenSSH one-line format, without a comment.
    static func openSSHLine(_ key: Curve25519.Signing.PrivateKey) -> String {
        "ssh-ed25519 " + publicKeyBlob(key).base64EncodedString()
    }

    private static func appendSSHString(_ bytes: Data, to data: inout Data) {
        var length = UInt32(bytes.count).bigEndian
        withUnsafeBytes(of: &length) { data.append(contentsOf: $0) }
        data.append(bytes)
    }
}
