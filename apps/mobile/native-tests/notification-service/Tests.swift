import Foundation
import UserNotifications

/// Port of the Swift app's AgentNotificationRendererTests and the key-store contract, driven by the
/// shared vectors. Plain assertions: the extension target cannot link a test framework.
enum Tests {
    private struct Vectors: Decodable {
        struct Valid: Decodable { let name: String; let key: String; let envelope: String }
        struct Invalid: Decodable { let name: String; let key: String; let envelope: String }
        let valid: [Valid]
        let invalid: [Invalid]
    }

    nonisolated(unsafe) private static var failed = 0
    nonisolated(unsafe) private static var passed = 0

    private static func check(_ ok: Bool, _ name: String, _ detail: @autoclosure () -> String = "") {
        if ok { passed += 1 } else { failed += 1; print("FAIL \(name) \(detail())") }
    }

    private static func record(_ key: String, _ host: String = "host") -> NotificationKeyRecord {
        NotificationKeyRecord(hostID: UUID(), hostName: host, key: Data(base64URLEncoded: key)!)
    }

    private static func alert(_ envelope: String, _ keys: [NotificationKeyRecord]) -> AgentNotificationAlert {
        AgentNotificationRenderer.alert(userInfo: ["envelope": envelope], keys: keys)
    }

    static func run(vectorsPath: String) -> Int {
        guard let data = FileManager.default.contents(atPath: vectorsPath),
            let v = try? JSONDecoder().decode(Vectors.self, from: data)
        else { print("FAIL cannot read vectors at \(vectorsPath)"); return 1 }

        func valid(_ name: String) -> Vectors.Valid { v.valid.first { $0.name == name }! }
        let blocked = valid("blocked claude agent")
        let done = valid("done codex agent under a second key")
        let blockedRec = record(blocked.key), doneRec = record(done.key)

        var a = alert(blocked.envelope, [blockedRec])
        check(a.title == "Claude" && a.body == "Blocked — waiting for input", "blocked without display fields", "\(a)")

        let project = valid("blocked agent with a project and a task title")
        a = alert(project.envelope, [record(project.key)])
        check(a.title == "Caterm · Claude" && a.body == "Blocked — waiting for input", "workspace leads", "\(a)")
        check(!alert(project.envelope, [record(project.key, "devbox@10.0.0.1")]).title.contains("devbox"), "never names the host")

        a = alert(valid("blocked agent with an approval preview").envelope, [record(project.key)])
        check(a.title == "Caterm · Claude" && a.body == "npm test Do you want to proceed?", "approval prompt shown", "\(a)")

        let limits = valid("approval preview at its size limits")
        a = alert(limits.envelope, [record(limits.key)])
        check(a.body.count <= ApprovalNotification.bodyLimit && a.body.hasSuffix("…") && ApprovalNotification.bodyLimit == 120, "prompt cut at 120")

        let hint = valid("approval hint without a prompt")
        check(alert(hint.envelope, [record(hint.key)]).body == "Blocked — waiting for input", "hint without prompt keeps status")

        a = alert(done.envelope, [doneRec])
        check(a.title == "Codex" && a.body == "Done", "done push", "\(a)")
        let odd = valid("unrecognized status string passes through leniently")
        check(alert(odd.envelope, [record(odd.key)]).body == "Status: exited", "unknown status factual")

        let both = [blockedRec, doneRec]
        check(alert(blocked.envelope, both).title == "Claude" && alert(done.envelope, both).title == "Codex", "kid selects the key")
        check(alert(blocked.envelope, [doneRec]) == AgentNotificationRenderer.fallback, "unknown kid falls back")
        check(alert(blocked.envelope, []) == AgentNotificationRenderer.fallback, "no keys falls back")
        for bad in v.invalid {
            check(alert(bad.envelope, [record(bad.key)]) == AgentNotificationRenderer.fallback, "invalid: \(bad.name)")
        }
        check(AgentNotificationRenderer.alert(userInfo: [:], keys: [blockedRec]) == AgentNotificationRenderer.fallback, "no envelope falls back")
        check(AgentNotificationRenderer.alert(userInfo: ["envelope": 42], keys: [blockedRec]) == AgentNotificationRenderer.fallback, "non-string envelope falls back")
        check(AgentNotificationRenderer.fallback.title == "Agentico" && AgentNotificationRenderer.fallback.body == "Agent update", "fallback copy generic")
        check(AgentNotificationRenderer.alert(workspace: "  ", agentKind: "claude", status: .blocked).title == "Claude", "blank workspace absent")

        func wrap(_ envelope: String) -> UNNotificationContent {
            let c = UNMutableNotificationContent()
            c.title = "Agentico"; c.subtitle = "Relay subtitle"; c.body = "Agent update"
            c.userInfo = ["envelope": envelope]
            return c
        }
        var c = AgentNotificationRenderer.content(rewriting: wrap(project.envelope), keys: [record(project.key)])
        check(c.title == "Caterm · Claude" && c.subtitle == "" && c.body == "Blocked — waiting for input" && c.sound == .default
            && c.userInfo["envelope"] as? String == project.envelope, "rewritten content")
        c = AgentNotificationRenderer.content(rewriting: wrap("garbage"), keys: [])
        check(c.title == "Agentico" && c.subtitle == "" && c.body == "Agent update" && c.sound == .default, "undecryptable content falls back with sound")

        // Key store contract on the in-memory store.
        let store = NotificationKeyStore(secrets: VolatileSecretStore(), mirror: nil)
        let id = UUID()
        try? store.save(NotificationKeyRecord(hostID: id, hostName: "h", key: Data(base64URLEncoded: blocked.key)!))
        check((try? store.allRecords().count) == 1 && (try? store.record(forHost: id))??.keyID == NotificationEnvelope.keyID(for: Data(base64URLEncoded: blocked.key)!), "store round trip")
        check((try? store.save(NotificationKeyRecord(hostID: id, hostName: "h", key: Data(count: 5)))) == nil, "short key refused")
        check((try? store.save(NotificationKeyRecord(hostID: id, hostName: " ", key: Data(count: 32)))) == nil, "blank name refused")
        try? store.removeRecord(forHost: id)
        check((try? store.allRecords().count) == 0, "remove")

        print("nse tests: \(passed) passed, \(failed) failed")
        return failed
    }
}
