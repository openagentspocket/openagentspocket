/**
 * Public API of the agentico-ssh module: device keys plus the six SSH primitives
 * (connect with Host Key policy, exec, direct-streamlocal, PTY, SFTP, direct-tcpip).
 * Every failure rejects with an `SshError` (see errors.ts). Timeouts are optional.
 */

export interface HostKey {
  /** The key algorithm, e.g. `ssh-ed25519`. */
  algorithm: string;
  /** OpenSSH presentation of its SHA-256: `SHA256:<base64 without padding>`. */
  fingerprint: string;
}

export interface ConnectOptions {
  host: string;
  port: number;
  username: string;
  /** Alias of a key generated and kept natively (Keychain / Keystore). JS never sees private keys. */
  keyAlias: string;
  /** Expected Host Key fingerprint. A different key fails with `hostKeyMismatch`. */
  pinnedHostKey?: string;
  /**
   * First contact (no pin): decides whether to trust the presented key; `false` fails with
   * `hostKeyRejected`. Without it the key is trusted on first use and returned for pinning.
   * Authentication never starts before the key was accepted.
   */
  confirmHostKey?: (hostKey: HostKey) => boolean | Promise<boolean>;
  timeoutMs?: number;
}

export interface Timeout {
  timeoutMs?: number;
}

export interface ExecOptions extends Timeout {
  /** Bytes written to the command's stdin, then EOF. */
  input?: Uint8Array;
}

export interface ExecResult {
  exitCode: number;
  /** UTF-8 decoded, malformed sequences replaced. */
  stdout: string;
  stderr: string;
}

export interface ExchangeOptions extends Timeout {
  /** Bound on the response line; past it the call fails with `responseTooLarge`. Default 1 MiB. */
  maxResponseBytes?: number;
}

export interface PtyOptions extends Timeout {
  /** Run directly, no login shell implied. Default: the user's login shell. */
  command?: string;
  /** TERM value. Default `xterm-256color`. */
  term?: string;
  cols: number;
  rows: number;
}

export type Unsubscribe = () => void;

/**
 * A bidirectional byte stream (PTY, streamlocal channel, TCP channel). Reading starts at the
 * first `onData` listener, so no early byte is lost. `onClose` fires once, with a code when the
 * stream failed (none for an orderly EOF or `close()`).
 */
export interface Stream {
  readonly id: string;
  write(data: Uint8Array): Promise<void>;
  onData(listener: (data: Uint8Array) => void): Unsubscribe;
  /**
   * The same chunks as base64 text, undecoded, for a consumer that forwards them (a terminal
   * renderer). Absent on fakes. Starts reading like `onData`; with only this listener nothing is
   * decoded in JavaScript.
   */
  onEncodedData?(listener: (base64: string) => void): Unsubscribe;
  onClose(listener: (reason?: string) => void): Unsubscribe;
  close(): Promise<void>;
}

export interface PtyStream extends Stream {
  resize(cols: number, rows: number): Promise<void>;
  /** The remote command's exit status once the PTY closed by itself, else undefined. */
  readonly exitStatus: number | undefined;
}

export type SftpKind = 'file' | 'directory' | 'symlink' | 'other';

/** SFTP v3 attributes; any field may be missing (null). Times are seconds since 1970. */
export interface SftpStat {
  kind: SftpKind | null;
  size: number | null;
  modifiedAt: number | null;
}

export interface SftpEntry extends SftpStat {
  name: string;
  isDirectory: boolean;
}

export interface SftpListing {
  /** Sorted by name; never `.` or `..`. */
  entries: SftpEntry[];
  /** More entries matched than `maxEntries`. */
  truncated: boolean;
  /** The read stopped early (`maxScanned`, or a batch the client could not decode). */
  scanIncomplete: boolean;
}

export interface SftpListOptions extends Timeout {
  kinds?: SftpKind[];
  namePrefix?: string;
  nameSuffixes?: string[];
  nameContains?: string;
  /** 1...1000, default 500. */
  maxEntries?: number;
  /** 1...20000, default 5000. */
  maxScanned?: number;
}

export interface SftpSlice {
  data: Uint8Array;
  /** The file's size when read; null when the file is gone. */
  length: number | null;
}

export interface Sftp {
  /** null when the path does not exist. */
  stat(path: string, options?: Timeout & { followSymlinks?: boolean }): Promise<SftpStat | null>;
  /** null when the directory does not exist. */
  list(path: string, options?: SftpListOptions): Promise<SftpListing | null>;
  /** The whole file, or null when it does not exist. */
  read(path: string, options?: Timeout): Promise<Uint8Array | null>;
  readRange(path: string, offset: number, maxBytes: number, options?: Timeout): Promise<SftpSlice>;
  /**
   * Creates `path` and fails if it exists. With `replace`, writes a sibling staging file and
   * renames it over `path` atomically.
   */
  write(
    path: string,
    data: Uint8Array,
    options?: Timeout & { permissions?: number; replace?: boolean },
  ): Promise<void>;
  /** Atomic; with `overwrite: false` (default) it fails when `to` exists. */
  rename(from: string, to: string, options?: Timeout & { overwrite?: boolean }): Promise<void>;
  unlink(path: string, options?: Timeout): Promise<void>;
  mkdir(path: string, options?: Timeout & { permissions?: number }): Promise<void>;
  /** Removes an empty directory only. */
  rmdir(path: string, options?: Timeout): Promise<void>;
  chmod(path: string, permissions: number, options?: Timeout): Promise<void>;
  close(): Promise<void>;
}

export interface LocalForward {
  /** 127.0.0.1 port that tunnels to the remote host:port. */
  localPort: number;
  close(): Promise<void>;
}

export interface SshSession {
  readonly sessionId: string;
  readonly hostKey: HostKey;
  /** The server's SSH identification string, e.g. `SSH-2.0-OpenSSH_9.9`. */
  readonly serverIdentification?: string;
  /** 1. exec: run a command, collect its output. */
  exec(command: string, options?: ExecOptions): Promise<ExecResult>;
  /** 2a. direct-streamlocal, one request: write it, read one response line, close. */
  exchangeStreamLocal(
    socketPath: string,
    request: Uint8Array,
    options?: ExchangeOptions,
  ): Promise<Uint8Array>;
  /** 2b. direct-streamlocal duplex (herdr's events subscription). */
  openStreamLocal(socketPath: string, options?: Timeout): Promise<Stream>;
  /** 3. PTY with resize. */
  openPty(options: PtyOptions): Promise<PtyStream>;
  /** 4. SFTP. */
  sftp(options?: Timeout): Promise<Sftp>;
  /** 5a. direct-tcpip duplex to a loopback/private address on the Host. */
  openTcp(host: string, port: number, options?: Timeout): Promise<Stream>;
  /** 5b. direct-tcpip behind a 127.0.0.1 listener on the phone. */
  forwardLocal(remoteHost: string, remotePort: number): Promise<LocalForward>;
  /** False once the connection cannot safely admit another operation. */
  isConnected(): Promise<boolean>;
  disconnect(): Promise<void>;
}

export interface SshModule {
  /** 0. Device keys: loads the key under `alias`, generating it on first use; returns only the public line. */
  generateKey(alias: string): Promise<{ publicKey: string }>;
  /** The OpenSSH public key line, or null when no key exists under `alias`. */
  publicKey(alias: string): Promise<string | null>;
  deleteKey(alias: string): Promise<void>;
  /** 6. connect, apply the Host Key policy, then authenticate with the device key. */
  connect(options: ConnectOptions): Promise<SshSession>;
}
