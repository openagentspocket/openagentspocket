/** Public API of the agentico-ssh native module: six primitives. No native code yet (spike pending). */

export interface ConnectOptions {
  host: string;
  port: number;
  username: string;
  /** Alias of a key generated and kept natively (Keychain / Keystore). JS never sees private keys. */
  keyAlias: string;
  /** Expected SHA-256 host-key fingerprint; omit on first contact (TOFU). */
  pinnedHostKey?: string;
}

export interface ConnectResult {
  sessionId: string;
  /** Host-key fingerprint the server presented, for the user to confirm on first contact. */
  hostKeyFingerprint: string;
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface PtyOptions {
  command?: string;
  cols: number;
  rows: number;
}

export interface SftpEntry {
  name: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: number;
}

export type Unsubscribe = () => void;

/** A bidirectional byte stream (PTY, streamlocal channel, forwarded connection). */
export interface Stream {
  readonly id: string;
  write(data: Uint8Array): Promise<void>;
  onData(listener: (data: Uint8Array) => void): Unsubscribe;
  onClose(listener: (reason?: string) => void): Unsubscribe;
  close(): Promise<void>;
}

export interface PtyStream extends Stream {
  resize(cols: number, rows: number): Promise<void>;
}

export interface Sftp {
  list(path: string): Promise<SftpEntry[]>;
  read(path: string): Promise<Uint8Array>;
  write(path: string, data: Uint8Array): Promise<void>;
  remove(path: string): Promise<void>;
}

export interface LocalForward {
  /** 127.0.0.1 port that tunnels to the remote host:port. */
  localPort: number;
  close(): Promise<void>;
}

export interface SshSession {
  readonly sessionId: string;
  /** 1. exec: run a command, collect its output. */
  exec(command: string): Promise<ExecResult>;
  /** 2. PTY with resize. */
  openPty(options: PtyOptions): Promise<PtyStream>;
  /** 3. direct-streamlocal: a channel to a Unix socket on the Host (herdr's API socket). */
  openStreamLocal(socketPath: string): Promise<Stream>;
  /** 4. SFTP. */
  sftp(): Promise<Sftp>;
  /** 5. direct-tcpip + local listener. */
  forwardLocal(remoteHost: string, remotePort: number): Promise<LocalForward>;
  disconnect(): Promise<void>;
}

export interface SshModule {
  /** 0. Key management lives natively: generate returns only the public key. */
  generateKey(alias: string): Promise<{ publicKey: string }>;
  /** 6. connect + auth with host-key pinning (TOFU). */
  connect(options: ConnectOptions): Promise<SshSession & ConnectResult>;
}
