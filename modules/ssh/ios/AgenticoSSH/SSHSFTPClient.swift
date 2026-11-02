import Foundation
import Synchronization

/// One ranged read of a remote file: the bytes that range holds, plus the
/// file's size at that moment. `length` is `nil` when the file is gone, which
/// is how a follower tells "nothing appended yet" from "the file it was
/// following no longer exists".
public struct SSHSFTPFileSlice: Sendable, Equatable {
    public let data: Data
    public let length: UInt64?

    public init(data: Data, length: UInt64?) {
        self.data = data
        self.length = length
    }
}

/// One SFTP subsystem channel owned by an authenticated SSH connection.
///
/// The surface is intentionally limited to Agentico's atomic file-staging needs
/// and read-only access to Agent transcripts (stat, filtered listings, ranged
/// reads). Native handles and remote paths never leave `SessionDriver`
/// diagnostics.
public final class SSHSFTPClient: Sendable {
    private let id: UInt64
    private let driver: SessionDriver
    private let closed = Mutex(false)

    init(id: UInt64, driver: SessionDriver) {
        self.id = id
        self.driver = driver
    }

    public func createDirectory(
        at path: String,
        permissions: UInt32,
        timeout: Duration
    ) async throws {
        try await driver.createSFTPDirectory(
            id: id,
            path: path,
            permissions: permissions,
            timeout: timeout)
    }

    public func attributes(at path: String, timeout: Duration) async throws
        -> SSHSFTPAttributes
    {
        try await driver.sftpAttributes(id: id, path: path, timeout: timeout)
    }

    public func setPermissions(
        _ permissions: UInt32,
        at path: String,
        timeout: Duration
    ) async throws {
        try await driver.setSFTPPermissions(
            id: id,
            path: path,
            permissions: permissions,
            timeout: timeout)
    }

    /// Reads one complete optional file without exposing a native read handle.
    /// A missing file is the expected `nil` case; every other SFTP status is
    /// surfaced as a path-free `SSHError`.
    public func readFileIfPresent(
        at path: String,
        timeout: Duration
    ) async throws -> Data? {
        try await driver.readSFTPFileIfPresent(
            id: id,
            path: path,
            timeout: timeout)
    }

    /// Reads at most `maxBytes` from `offset`, answering only that range.
    ///
    /// A file that reaches tens of megabytes and grows cannot be read whole on
    /// every look, so a follower asks for what it has not seen yet and uses
    /// `length` to notice the file it was following was replaced. Callers that
    /// look repeatedly should hold one client: each SFTP channel is a real
    /// server-side allocation.
    public func readFileRange(
        at path: String,
        offset: UInt64,
        maxBytes: Int,
        timeout: Duration
    ) async throws -> SSHSFTPFileSlice {
        try await driver.readSFTPFileRange(
            id: id,
            path: path,
            offset: offset,
            maxBytes: maxBytes,
            timeout: timeout)
    }

    /// Lists the directories directly inside one remote directory without
    /// exposing a native directory handle. A missing directory surfaces as
    /// a path-free `SSHError.sftpFailure`.
    public func listDirectories(
        at path: String,
        timeout: Duration
    ) async throws -> SSHSFTPDirectoryListing {
        try await driver.listSFTPDirectories(
            id: id,
            path: path,
            timeout: timeout)
    }

    /// Stats one path, following a symlink unless `followSymlinks` is false.
    /// A missing path is nil, so a follower can tell "gone" from "failed";
    /// every other SFTP status surfaces as a path-free `SSHError`.
    public func fileStatus(
        at path: String,
        followSymlinks: Bool = true,
        timeout: Duration
    ) async throws -> SSHSFTPFileStatus? {
        try await driver.sftpFileStatus(
            id: id,
            path: path,
            followSymlinks: followSymlinks,
            timeout: timeout)
    }

    /// Lists the entries of one directory that match `query`, sorted by name
    /// and capped by the query. A missing directory is nil. Read-only: it
    /// exists so a transcript reader can find a session file by name.
    public func listEntries(
        at path: String,
        matching query: SSHSFTPEntryQuery,
        timeout: Duration
    ) async throws -> SSHSFTPEntryListing? {
        try await driver.listSFTPEntries(
            id: id,
            path: path,
            query: query,
            timeout: timeout)
    }

    public func openFileForWriting(
        at path: String,
        permissions: UInt32,
        timeout: Duration
    ) async throws -> SSHSFTPFile {
        try await driver.openSFTPFileForWriting(
            sftpID: id,
            path: path,
            permissions: permissions,
            timeout: timeout)
    }

    public func removeFile(at path: String, timeout: Duration) async throws {
        try await driver.removeSFTPFile(id: id, path: path, timeout: timeout)
    }

    /// Removes one exact operation-owned path during failure compensation.
    /// This call ignores caller cancellation, verifies that the path is absent,
    /// and remains bounded by `timeout`.
    public func removeFileForCompensation(
        at path: String,
        timeout: Duration
    ) async throws {
        try await driver.removeSFTPFileForCompensation(
            id: id,
            path: path,
            timeout: timeout)
    }

    public func renameFileAtomically(
        from sourcePath: String,
        to destinationPath: String,
        timeout: Duration
    ) async throws {
        try await driver.renameSFTPFileAtomically(
            id: id,
            sourcePath: sourcePath,
            destinationPath: destinationPath,
            timeout: timeout)
    }

    /// Opens one file for reading front to back, so a large download costs
    /// one open instead of one per range. A missing file surfaces as
    /// `SSHError.sftpFailure` with the no-such-file status.
    public func openFileForReading(
        at path: String,
        timeout: Duration
    ) async throws -> SSHSFTPReadFile {
        try await driver.openSFTPFileForReading(
            sftpID: id,
            path: path,
            timeout: timeout)
    }

    /// Renames without ever replacing what is there. `renameFileAtomically`
    /// overwrites, which is right for staging and wrong for a user's own
    /// files: this asks for SSH_FXP_RENAME without the overwrite flag, which
    /// an SFTP version 3 server (OpenSSH) refuses with `SSH_FX_FAILURE` when
    /// the destination exists. The status alone cannot say why, so a caller
    /// that needs to tell "exists" apart stats the destination.
    public func renameWithoutOverwrite(
        from sourcePath: String,
        to destinationPath: String,
        timeout: Duration
    ) async throws {
        try await driver.renameSFTPFileWithoutOverwrite(
            id: id,
            sourcePath: sourcePath,
            destinationPath: destinationPath,
            timeout: timeout)
    }

    /// Removes one empty directory. The server refuses a directory that
    /// still has entries (OpenSSH answers `SSH_FX_FAILURE`); nothing here
    /// ever removes a tree.
    public func removeDirectory(at path: String, timeout: Duration) async throws {
        try await driver.removeSFTPDirectory(id: id, path: path, timeout: timeout)
    }

    /// Closes only this SFTP subsystem channel. Idempotent.
    public func close(timeout: Duration) async throws {
        let shouldClose = closed.withLock { closed in
            guard !closed else { return false }
            closed = true
            return true
        }
        guard shouldClose else { return }
        try await driver.closeSFTP(id: id, timeout: timeout)
    }

    deinit {
        let shouldClose = closed.withLock { closed in
            guard !closed else { return false }
            closed = true
            return true
        }
        guard shouldClose else { return }
        let id = id
        let driver = driver
        Task { try? await driver.closeSFTP(id: id, timeout: .seconds(2)) }
    }
}

/// One read-only SFTP file handle, read in order from its start.
public final class SSHSFTPReadFile: Sendable {
    /// The most one `read` answers.
    public static let maximumChunkBytes = 64 * 1_024

    private let sftpID: UInt64
    private let fileID: UInt64
    private let driver: SessionDriver
    private let closed = Mutex(false)

    init(sftpID: UInt64, fileID: UInt64, driver: SessionDriver) {
        self.sftpID = sftpID
        self.fileID = fileID
        self.driver = driver
    }

    /// The next bytes of the file, at most `maximumChunkBytes`; nil at its
    /// end. A read that throws leaves the position unknown, so the caller
    /// closes the handle rather than reading on.
    public func read(timeout: Duration) async throws -> Data? {
        guard !closed.withLock({ $0 }) else { throw SSHError.channelFailed }
        return try await driver.readSFTPFileHandle(
            sftpID: sftpID,
            fileID: fileID,
            timeout: timeout)
    }

    /// Moves the read position to `offset` from the file's start. Local to
    /// the handle: the next read is what travels.
    public func seek(to offset: UInt64, timeout: Duration) async throws {
        guard !closed.withLock({ $0 }) else { throw SSHError.channelFailed }
        try await driver.seekSFTPFileHandle(
            sftpID: sftpID,
            fileID: fileID,
            offset: offset,
            timeout: timeout)
    }

    /// Closes only this file handle. Idempotent.
    public func close(timeout: Duration) async throws {
        let shouldClose = closed.withLock { closed in
            guard !closed else { return false }
            closed = true
            return true
        }
        guard shouldClose else { return }
        try await driver.closeSFTPFile(
            sftpID: sftpID,
            fileID: fileID,
            timeout: timeout)
    }

    deinit {
        let shouldClose = closed.withLock { closed in
            guard !closed else { return false }
            closed = true
            return true
        }
        guard shouldClose else { return }
        let sftpID = sftpID
        let fileID = fileID
        let driver = driver
        Task {
            try? await driver.closeSFTPFile(
                sftpID: sftpID,
                fileID: fileID,
                timeout: .seconds(2))
        }
    }
}

/// One write-only SFTP file handle.
public final class SSHSFTPFile: Sendable {
    private let sftpID: UInt64
    private let fileID: UInt64
    private let driver: SessionDriver
    private let closed = Mutex(false)

    init(sftpID: UInt64, fileID: UInt64, driver: SessionDriver) {
        self.sftpID = sftpID
        self.fileID = fileID
        self.driver = driver
    }

    public func write(_ data: Data, timeout: Duration) async throws {
        try await driver.writeSFTPFile(
            sftpID: sftpID,
            fileID: fileID,
            data: data,
            timeout: timeout)
    }

    /// Closes only this file handle. Idempotent.
    public func close(timeout: Duration) async throws {
        let shouldClose = closed.withLock { closed in
            guard !closed else { return false }
            closed = true
            return true
        }
        guard shouldClose else { return }
        try await driver.closeSFTPFile(
            sftpID: sftpID,
            fileID: fileID,
            timeout: timeout)
    }

    deinit {
        let shouldClose = closed.withLock { closed in
            guard !closed else { return false }
            closed = true
            return true
        }
        guard shouldClose else { return }
        let sftpID = sftpID
        let fileID = fileID
        let driver = driver
        Task {
            try? await driver.closeSFTPFile(
                sftpID: sftpID,
                fileID: fileID,
                timeout: .seconds(2))
        }
    }
}
