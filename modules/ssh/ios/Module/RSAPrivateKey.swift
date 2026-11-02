import Foundation
import Security

/// An RSA private key handed over for one connection (PEM text from the secure store). It is
/// parsed into PKCS#1 DER, signs RSA-SHA2-512 with the Security framework and is dropped when the
/// authentication ends; nothing is persisted here.
struct RSAPrivateKey: Sendable {
    enum Failure: Error {
        case invalid
        case encrypted
    }

    private let pkcs1: Data
    /// SSH wire-format public key blob: `string "ssh-rsa"`, `mpint e`, `mpint n`.
    let publicKeyBlob: Data

    init(pem: String) throws {
        let (label, body) = try Self.decodePEM(pem)
        switch label {
        case "RSA PRIVATE KEY":
            try self.init(pkcs1: body)
        case "PRIVATE KEY":
            try self.init(pkcs1: try Self.unwrapPKCS8(body))
        case "ENCRYPTED PRIVATE KEY":
            throw Failure.encrypted
        case "OPENSSH PRIVATE KEY":
            try self.init(pkcs1: try Self.pkcs1FromOpenSSH(body))
        default:
            throw Failure.invalid
        }
    }

    private init(pkcs1: Data) throws {
        var reader = ASN1Reader(pkcs1)
        var fields = ASN1Reader(try reader.read(tag: 0x30))
        guard reader.isAtEnd, try fields.read(tag: 0x02) == Data([0]) else { throw Failure.invalid }
        let modulus = Self.unsigned(try fields.read(tag: 0x02))
        let exponent = Self.unsigned(try fields.read(tag: 0x02))
        guard !modulus.isEmpty, !exponent.isEmpty else { throw Failure.invalid }
        var blob = Data()
        blob.appendSSHString(Data("ssh-rsa".utf8))
        blob.appendSSHString(Self.mpint(exponent))
        blob.appendSSHString(Self.mpint(modulus))
        self.pkcs1 = pkcs1
        self.publicKeyBlob = blob
        guard (try? secKey()) != nil else { throw Failure.invalid }
    }

    /// The raw signature for the data to sign; libssh2 wraps it with the algorithm name.
    func signature(for data: Data) throws -> Data {
        var error: Unmanaged<CFError>?
        guard
            let signature = SecKeyCreateSignature(
                try secKey(), .rsaSignatureMessagePKCS1v15SHA512, data as CFData, &error) as Data?
        else { throw Failure.invalid }
        return signature
    }

    private func secKey() throws -> SecKey {
        var error: Unmanaged<CFError>?
        guard
            let key = SecKeyCreateWithData(
                pkcs1 as CFData,
                [
                    kSecAttrKeyType as String: kSecAttrKeyTypeRSA,
                    kSecAttrKeyClass as String: kSecAttrKeyClassPrivate,
                ] as CFDictionary, &error)
        else { throw Failure.invalid }
        return key
    }

    // MARK: PEM and containers

    private static func decodePEM(_ pem: String) throws -> (label: String, body: Data) {
        let lines = pem.split(whereSeparator: \.isNewline).map { $0.trimmingCharacters(in: .whitespaces) }
        guard
            let begin = lines.firstIndex(where: { $0.hasPrefix("-----BEGIN ") && $0.hasSuffix("-----") }),
            let end = lines.firstIndex(where: { $0.hasPrefix("-----END ") && $0.hasSuffix("-----") }),
            begin < end
        else { throw Failure.invalid }
        let label = String(lines[begin].dropFirst("-----BEGIN ".count).dropLast("-----".count))
        let headers = lines[(begin + 1)..<end].filter { $0.contains(":") }
        if headers.contains(where: { $0.contains("ENCRYPTED") }) { throw Failure.encrypted }
        let base64 = lines[(begin + 1)..<end].filter { !$0.contains(":") }.joined()
        guard let body = Data(base64Encoded: base64) else { throw Failure.invalid }
        return (label, body)
    }

    /// The PKCS#1 key inside a PKCS#8 `PrivateKeyInfo` for `rsaEncryption`.
    private static func unwrapPKCS8(_ der: Data) throws -> Data {
        var outer = ASN1Reader(der)
        var info = ASN1Reader(try outer.read(tag: 0x30))
        _ = try info.read(tag: 0x02)
        var algorithm = ASN1Reader(try info.read(tag: 0x30))
        let rsaEncryption = Data([0x2A, 0x86, 0x48, 0x86, 0xF7, 0x0D, 0x01, 0x01, 0x01])
        guard try algorithm.read(tag: 0x06) == rsaEncryption else { throw Failure.invalid }
        return try info.read(tag: 0x04)
    }

    /// Rebuilds PKCS#1 from an unencrypted `openssh-key-v1` RSA key.
    private static func pkcs1FromOpenSSH(_ data: Data) throws -> Data {
        var reader = SSHReader(data)
        guard reader.take(Data("openssh-key-v1\0".utf8).count) == Data("openssh-key-v1\0".utf8) else {
            throw Failure.invalid
        }
        guard let cipher = reader.string(), let kdf = reader.string(), reader.string() != nil,
            reader.uint32() == 1, reader.string() != nil, let privateBlob = reader.string()
        else { throw Failure.invalid }
        if cipher != Data("none".utf8) || kdf != Data("none".utf8) { throw Failure.encrypted }

        var inner = SSHReader(privateBlob)
        guard inner.uint32() == inner.uint32(), inner.string() == Data("ssh-rsa".utf8),
            let n = inner.string(), let e = inner.string(), let d = inner.string(),
            let iqmp = inner.string(), let p = inner.string(), let q = inner.string()
        else { throw Failure.invalid }
        let (pm, qm) = (unsigned(p), unsigned(q))
        let one = Data([1])
        let dp = BigUInt.remainder(unsigned(d), BigUInt.subtract(pm, one))
        let dq = BigUInt.remainder(unsigned(d), BigUInt.subtract(qm, one))
        var body = Data()
        for integer in [Data([0]), n, e, d, p, q, dp, dq, iqmp] {
            body.append(ASN1Writer.integer(unsigned(integer)))
        }
        return ASN1Writer.sequence(body)
    }

    // MARK: Integers

    /// Big-endian magnitude without leading zero bytes (at least one byte).
    fileprivate static func unsigned(_ integer: Data) -> Data {
        let trimmed = integer.drop(while: { $0 == 0 })
        return trimmed.isEmpty ? Data([0]) : Data(trimmed)
    }

    /// SSH `mpint` payload: a leading zero when the top bit is set.
    private static func mpint(_ magnitude: Data) -> Data {
        guard let first = magnitude.first, first & 0x80 != 0 else { return magnitude }
        return Data([0]) + magnitude
    }
}

// MARK: ASN.1

private struct ASN1Reader {
    private let bytes: [UInt8]
    private var offset = 0

    init(_ data: Data) { bytes = Array(data) }

    var isAtEnd: Bool { offset == bytes.count }

    mutating func read(tag: UInt8) throws -> Data {
        guard offset < bytes.count, bytes[offset] == tag else { throw RSAPrivateKey.Failure.invalid }
        offset += 1
        guard offset < bytes.count else { throw RSAPrivateKey.Failure.invalid }
        var length = Int(bytes[offset])
        offset += 1
        if length & 0x80 != 0 {
            let count = length & 0x7f
            guard count > 0, count <= 4, count <= bytes.count - offset else {
                throw RSAPrivateKey.Failure.invalid
            }
            length = 0
            for _ in 0..<count {
                length = (length << 8) | Int(bytes[offset])
                offset += 1
            }
        }
        guard length <= bytes.count - offset else { throw RSAPrivateKey.Failure.invalid }
        defer { offset += length }
        return Data(bytes[offset..<offset + length])
    }
}

private enum ASN1Writer {
    static func integer(_ magnitude: Data) -> Data {
        var content = magnitude
        if let first = content.first, first & 0x80 != 0 { content = Data([0]) + content }
        return Data([0x02]) + length(content.count) + content
    }

    static func sequence(_ body: Data) -> Data {
        Data([0x30]) + length(body.count) + body
    }

    private static func length(_ count: Int) -> Data {
        if count < 0x80 { return Data([UInt8(count)]) }
        var digits: [UInt8] = []
        var rest = count
        while rest > 0 {
            digits.insert(UInt8(rest & 0xff), at: 0)
            rest >>= 8
        }
        return Data([0x80 | UInt8(digits.count)] + digits)
    }
}

// MARK: SSH wire

private struct SSHReader {
    private let bytes: [UInt8]
    private var offset = 0

    init(_ data: Data) { bytes = Array(data) }

    mutating func take(_ count: Int) -> Data? {
        guard count >= 0, count <= bytes.count - offset else { return nil }
        defer { offset += count }
        return Data(bytes[offset..<offset + count])
    }

    mutating func uint32() -> UInt32? {
        guard let raw = take(4) else { return nil }
        return raw.reduce(0) { ($0 << 8) | UInt32($1) }
    }

    mutating func string() -> Data? {
        guard let length = uint32() else { return nil }
        return take(Int(length))
    }
}

private extension Data {
    mutating func appendSSHString(_ field: Data) {
        var length = UInt32(field.count).bigEndian
        Swift.withUnsafeBytes(of: &length) { append(contentsOf: $0) }
        append(field)
    }
}

// MARK: Big integers (only what the CRT parameters need)

private enum BigUInt {
    /// `a - b` for `a >= b`, big-endian magnitudes.
    static func subtract(_ a: Data, _ b: Data) -> Data {
        var result = Array(a)
        var other = Array(b)
        other.insert(contentsOf: [UInt8](repeating: 0, count: result.count - other.count), at: 0)
        var borrow = 0
        for index in stride(from: result.count - 1, through: 0, by: -1) {
            var value = Int(result[index]) - Int(other[index]) - borrow
            borrow = value < 0 ? 1 : 0
            if value < 0 { value += 256 }
            result[index] = UInt8(value)
        }
        return RSAPrivateKey.trimmed(Data(result))
    }

    /// `value mod modulus` by binary long division.
    static func remainder(_ value: Data, _ modulus: Data) -> Data {
        var rest = Data([0])
        for byte in value {
            for shift in stride(from: 7, through: 0, by: -1) {
                rest = shiftedLeft(rest, adding: (byte >> UInt8(shift)) & 1)
                if compare(rest, modulus) >= 0 { rest = subtract(rest, modulus) }
            }
        }
        return rest
    }

    private static func shiftedLeft(_ value: Data, adding bit: UInt8) -> Data {
        var out = [UInt8](repeating: 0, count: value.count + 1)
        var carry = bit
        for index in stride(from: value.count - 1, through: 0, by: -1) {
            let byte = value[value.startIndex + index]
            out[index + 1] = (byte << 1) | carry
            carry = byte >> 7
        }
        out[0] = carry
        return RSAPrivateKey.trimmed(Data(out))
    }

    private static func compare(_ a: Data, _ b: Data) -> Int {
        if a.count != b.count { return a.count < b.count ? -1 : 1 }
        for (x, y) in zip(a, b) where x != y { return x < y ? -1 : 1 }
        return 0
    }
}

extension RSAPrivateKey {
    fileprivate static func trimmed(_ data: Data) -> Data { unsigned(data) }
}
