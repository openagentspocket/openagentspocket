import Darwin
import Foundation

/// Where an `SSHTCPChannel` may lead, as seen from the Host: its own loopback,
/// or one of its private or link-local addresses (F6a, spec D5).
///
/// The channel is a direct-tcpip forward, so the SSH server is the one that
/// connects. A hostname or a public address would turn the Host into a relay
/// to anywhere it can reach; this type refuses both before any channel opens,
/// whatever the caller computed. Only numeric IPv4 and IPv6 literals pass, and
/// `host` is their canonical text, so the server is handed exactly the address
/// that was checked. Scoped (`%iface`) and IPv4-mapped IPv6 forms are refused
/// rather than interpreted.
///
/// Allowed ranges: 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16,
/// 169.254.0.0/16, ::1, fc00::/7 and fe80::/10. Whether the address belongs
/// to the Host is the caller's to establish (its discovery output); sshd's
/// own `PermitOpen` still applies on top.
public struct SSHTCPTarget: Sendable, Hashable {
    /// The canonical numeric address the server connects to.
    public let host: String
    public let port: UInt16

    /// The Host's IPv4 loopback, for servers bound to `127.0.0.1` or to the
    /// wildcard address. Nil only for port 0.
    public static func loopbackV4(port: UInt16) -> SSHTCPTarget? {
        SSHTCPTarget(address: "127.0.0.1", port: port)
    }

    /// The Host's IPv6 loopback, for servers bound to `::1` only. Nil only for
    /// port 0.
    public static func loopbackV6(port: UInt16) -> SSHTCPTarget? {
        SSHTCPTarget(address: "::1", port: port)
    }

    /// Validates one numeric address. Nil for port 0, any hostname, and any
    /// address outside the loopback, private and link-local ranges.
    public init?(address: String, port: UInt16) {
        guard port > 0, let host = Self.canonicalAllowedAddress(address) else { return nil }
        self.host = host
        self.port = port
    }

    static func canonicalAllowedAddress(_ address: String) -> String? {
        guard
            !address.isEmpty,
            address.utf8.count <= Int(INET6_ADDRSTRLEN),
            address.utf8.allSatisfy({ $0 > 0x20 && $0 < 0x7F }),
            !address.contains("%")
        else {
            return nil
        }
        var v4 = in_addr()
        if inet_pton(AF_INET, address, &v4) == 1 {
            let bytes = withUnsafeBytes(of: v4) { Array($0) }
            guard isAllowedIPv4(bytes) else { return nil }
            return canonicalText(family: AF_INET, of: v4)
        }
        var v6 = in6_addr()
        if inet_pton(AF_INET6, address, &v6) == 1 {
            let bytes = withUnsafeBytes(of: v6) { Array($0) }
            guard isAllowedIPv6(bytes) else { return nil }
            return canonicalText(family: AF_INET6, of: v6)
        }
        return nil
    }

    private static func isAllowedIPv4(_ bytes: [UInt8]) -> Bool {
        guard bytes.count == 4 else { return false }
        switch (bytes[0], bytes[1]) {
        case (127, _), (10, _), (192, 168), (169, 254):
            return true
        case (172, let second):
            return second & 0xF0 == 16
        default:
            return false
        }
    }

    private static func isAllowedIPv6(_ bytes: [UInt8]) -> Bool {
        guard bytes.count == 16 else { return false }
        if bytes[0..<15].allSatisfy({ $0 == 0 }), bytes[15] == 1 { return true }
        if bytes[0] & 0xFE == 0xFC { return true }
        return bytes[0] == 0xFE && bytes[1] & 0xC0 == 0x80
    }

    private static func canonicalText<Address>(family: Int32, of address: Address) -> String? {
        let capacity = Int(INET6_ADDRSTRLEN)
        var buffer = [CChar](repeating: 0, count: capacity)
        let rendered = withUnsafePointer(to: address) { pointer in
            inet_ntop(family, pointer, &buffer, socklen_t(capacity))
        }
        guard rendered != nil else { return nil }
        let text = buffer.prefix(while: { $0 != 0 }).map { UInt8(bitPattern: $0) }
        return String(decoding: text, as: UTF8.self)
    }
}
