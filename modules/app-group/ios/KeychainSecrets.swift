import Foundation
import Security

/// Generic-password Keychain items under one service and access group. The Notification Service
/// Extension reads the Notification Keys the app writes here (same service, same group), so the
/// attributes mirror the extension's `KeychainSecretStore`: after first unlock, this device only.
enum KeychainSecrets {
    static func save(service: String, group: String, account: String, value: String) -> Bool {
        var attributes = query(service, group, account)
        attributes[kSecValueData as String] = Data(value.utf8)
        attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(attributes as CFDictionary, nil)
        if status == errSecDuplicateItem {
            let update = [kSecValueData as String: Data(value.utf8)]
            return SecItemUpdate(query(service, group, account) as CFDictionary, update as CFDictionary)
                == errSecSuccess
        }
        return status == errSecSuccess
    }

    static func read(service: String, group: String, account: String) -> String? {
        var q = query(service, group, account)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &item) == errSecSuccess, let data = item as? Data
        else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func readAll(service: String, group: String) -> [String: String] {
        var q = query(service, group, nil)
        q[kSecReturnData as String] = true
        q[kSecReturnAttributes as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitAll
        var items: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &items) == errSecSuccess else { return [:] }
        var result: [String: String] = [:]
        for item in items as? [[String: Any]] ?? [] {
            if let account = item[kSecAttrAccount as String] as? String,
                let data = item[kSecValueData as String] as? Data,
                let text = String(data: data, encoding: .utf8)
            {
                result[account] = text
            }
        }
        return result
    }

    static func remove(service: String, group: String, account: String) -> Bool {
        let status = SecItemDelete(query(service, group, account) as CFDictionary)
        return status == errSecSuccess || status == errSecItemNotFound
    }

    private static func query(_ service: String, _ group: String, _ account: String?) -> [String: Any] {
        var q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccessGroup as String: group,
        ]
        if let account { q[kSecAttrAccount as String] = account }
        return q
    }
}
