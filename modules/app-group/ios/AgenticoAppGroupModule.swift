import ExpoModulesCore
import Foundation
import UserNotifications
import WidgetKit

/// Writes the widgets' snapshot into the App Group container the widget extension reads, and
/// asks WidgetKit to redraw. Files only: names are plain file names, never paths.
public final class AgenticoAppGroupModule: Module {
    public func definition() -> ModuleDefinition {
        Name("AgenticoAppGroup")

        /// The container's path, or nil when the entitlement is missing.
        AsyncFunction("containerPath") { (group: String) -> String? in
            Self.container(group)?.path
        }

        /// Atomic write, readable after the first unlock (widgets render on the Lock Screen),
        /// excluded from backup. Returns false when the container is unavailable.
        AsyncFunction("writeFile") { (group: String, name: String, text: String) -> Bool in
            guard Self.isPlainName(name), var url = Self.container(group)?.appendingPathComponent(name)
            else { return false }
            do {
                try Data(text.utf8).write(
                    to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
                var values = URLResourceValues()
                values.isExcludedFromBackup = true
                try? url.setResourceValues(values)
                return true
            } catch {
                return false
            }
        }

        AsyncFunction("readFile") { (group: String, name: String) -> String? in
            guard Self.isPlainName(name), let url = Self.container(group)?.appendingPathComponent(name)
            else { return nil }
            return try? String(contentsOf: url, encoding: .utf8)
        }

        /// Keychain items shared with the Notification Service Extension (see KeychainSecrets).
        /// Synchronous: the core key store contract is synchronous.
        Function("keychainSave") { (service: String, group: String, account: String, value: String) -> Bool in
            KeychainSecrets.save(service: service, group: group, account: account, value: value)
        }

        Function("keychainRead") { (service: String, group: String, account: String) -> String? in
            KeychainSecrets.read(service: service, group: group, account: account)
        }

        Function("keychainReadAll") { (service: String, group: String) -> [String: String] in
            KeychainSecrets.readAll(service: service, group: group)
        }

        Function("keychainRemove") { (service: String, group: String, account: String) -> Bool in
            KeychainSecrets.remove(service: service, group: group, account: account)
        }

        /// Asks iOS for alert/sound/badge permission; the extension only runs for allowed pushes.
        AsyncFunction("requestNotificationAuthorization") { () async -> Bool in
            (try? await UNUserNotificationCenter.current()
                .requestAuthorization(options: [.alert, .sound, .badge])) ?? false
        }

        AsyncFunction("reloadWidgets") { (kinds: [String]) in
            if kinds.isEmpty {
                WidgetCenter.shared.reloadAllTimelines()
            } else {
                for kind in kinds { WidgetCenter.shared.reloadTimelines(ofKind: kind) }
            }
        }
    }

    private static func container(_ group: String) -> URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)
    }

    private static func isPlainName(_ name: String) -> Bool {
        !name.isEmpty && !name.contains("/") && name != "." && name != ".."
    }
}
