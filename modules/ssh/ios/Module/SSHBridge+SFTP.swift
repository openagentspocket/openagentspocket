import Foundation

/// SFTP over one subsystem channel per client id. Missing paths answer nil
/// where the package does (stat, list, read); every other status throws
/// `sftpFailure`. Writes create a new file and fail when it exists (the
/// package opens with O_EXCL); replacing goes through `rename`.
extension SSHBridge {
    func sftpOpen(sessionId: String, timeout: Duration) async throws -> String {
        let connection = try await registry.connection(sessionId)
        let client = try await connection.openSFTP(timeout: timeout)
        do {
            return try await registry.add(sftp: client, sessionId: sessionId)
        } catch {
            try? await client.close(timeout: .seconds(1))
            throw error
        }
    }

    func sftpClose(sftpId: String) async {
        try? await registry.removeSftp(sftpId)?.close(timeout: .seconds(2))
    }

    func sftpStat(sftpId: String, path: String, followSymlinks: Bool, timeout: Duration)
        async throws -> [String: Any?]?
    {
        let client = try await registry.sftp(sftpId)
        guard
            let status = try await client.fileStatus(
                at: path, followSymlinks: followSymlinks, timeout: timeout)
        else { return nil }
        return Self.describe(status)
    }

    func sftpList(sftpId: String, path: String, query: [String: Any], timeout: Duration)
        async throws -> [String: Any]?
    {
        let client = try await registry.sftp(sftpId)
        guard
            let listing = try await client.listEntries(
                at: path, matching: Self.entryQuery(query), timeout: timeout)
        else { return nil }
        let entries: [[String: Any?]] = listing.entries.map { entry in
            var described = Self.describe(entry.status)
            described["name"] = entry.name
            return described
        }
        return [
            "entries": entries,
            "truncated": listing.truncated,
            "scanIncomplete": listing.scanIncomplete,
        ]
    }

    func sftpRead(sftpId: String, path: String, timeout: Duration) async throws -> String? {
        let client = try await registry.sftp(sftpId)
        return try await client.readFileIfPresent(at: path, timeout: timeout)?
            .base64EncodedString()
    }

    func sftpReadRange(
        sftpId: String, path: String, offset: Double, maxBytes: Int, timeout: Duration
    ) async throws -> [String: Any?] {
        guard offset >= 0, offset < 9.007e15, maxBytes > 0 else {
            throw BridgeError.invalidArgument("range")
        }
        let client = try await registry.sftp(sftpId)
        let slice = try await client.readFileRange(
            at: path, offset: UInt64(offset), maxBytes: maxBytes, timeout: timeout)
        return ["data": slice.data.base64EncodedString(), "length": slice.length.map { Double($0) }]
    }

    func sftpWrite(
        sftpId: String, path: String, base64: String, permissions: Int, timeout: Duration
    ) async throws {
        let data = try decode(base64)
        let client = try await registry.sftp(sftpId)
        let file = try await client.openFileForWriting(
            at: path, permissions: try Self.mode(permissions), timeout: timeout)
        do {
            try await file.write(data, timeout: timeout)
        } catch {
            try? await file.close(timeout: .seconds(2))
            throw error
        }
        try await file.close(timeout: timeout)
    }

    func sftpRename(sftpId: String, from: String, to: String, overwrite: Bool, timeout: Duration)
        async throws
    {
        let client = try await registry.sftp(sftpId)
        if overwrite {
            try await client.renameFileAtomically(from: from, to: to, timeout: timeout)
        } else {
            try await client.renameWithoutOverwrite(from: from, to: to, timeout: timeout)
        }
    }

    func sftpUnlink(sftpId: String, path: String, timeout: Duration) async throws {
        try await registry.sftp(sftpId).removeFile(at: path, timeout: timeout)
    }

    func sftpMkdir(sftpId: String, path: String, permissions: Int, timeout: Duration) async throws {
        try await registry.sftp(sftpId).createDirectory(
            at: path, permissions: try Self.mode(permissions), timeout: timeout)
    }

    func sftpRmdir(sftpId: String, path: String, timeout: Duration) async throws {
        try await registry.sftp(sftpId).removeDirectory(at: path, timeout: timeout)
    }

    func sftpChmod(sftpId: String, path: String, permissions: Int, timeout: Duration) async throws {
        try await registry.sftp(sftpId).setPermissions(
            try Self.mode(permissions), at: path, timeout: timeout)
    }

    private static func mode(_ permissions: Int) throws -> UInt32 {
        guard (0...0o7777).contains(permissions) else {
            throw BridgeError.invalidArgument("permissions")
        }
        return UInt32(permissions)
    }

    private static func describe(_ status: SSHSFTPFileStatus) -> [String: Any?] {
        let kind: String? =
            switch status.kind {
            case .regular: "file"
            case .directory: "directory"
            case .symlink: "symlink"
            case .other: "other"
            case nil: nil
            }
        return [
            "kind": kind,
            "size": status.size.map { Double($0) },
            "modifiedAt": status.modificationTime.map { Double($0) },
        ]
    }

    private static func entryQuery(_ query: [String: Any]) -> SSHSFTPEntryQuery {
        let kinds = (query["kinds"] as? [String] ?? []).compactMap { kind -> SSHSFTPEntryKind? in
            switch kind {
            case "file": .regular
            case "directory": .directory
            case "symlink": .symlink
            case "other": .other
            default: nil
            }
        }
        return SSHSFTPEntryQuery(
            kinds: Set(kinds),
            namePrefix: query["namePrefix"] as? String,
            nameSuffixes: query["nameSuffixes"] as? [String] ?? [],
            nameContains: query["nameContains"] as? String,
            maximumEntries: (query["maxEntries"] as? NSNumber)?.intValue ?? 500,
            maximumScanned: (query["maxScanned"] as? NSNumber)?.intValue ?? 5_000)
    }
}
