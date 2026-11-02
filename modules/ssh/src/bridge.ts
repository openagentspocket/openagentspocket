/**
 * The raw native module surface (`AgenticoSSH`, ios/Module/AgenticoSSHModule.swift). Ids name
 * native objects, bytes are base64, failures reject with an error whose `code` is an
 * `SshErrorCode`. Only `client.ts` talks to it; apps use the `SshModule` it builds.
 */

export interface NativeHello {
  sessionId: string;
  hostKeyAlgorithm: string;
  hostKeyFingerprint: string;
  /** The raw Host Key blob, base64. */
  hostKey: string;
  serverIdentification: string | null;
}

export interface NativeExec {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface NativeStat {
  kind: string | null;
  size: number | null;
  modifiedAt: number | null;
}

export interface NativeListing {
  entries: (NativeStat & { name: string })[];
  truncated: boolean;
  scanIncomplete: boolean;
}

export interface NativeListQuery {
  kinds?: string[];
  namePrefix?: string;
  nameSuffixes?: string[];
  nameContains?: string;
  maxEntries?: number;
  maxScanned?: number;
}

export interface StreamDataEvent {
  streamId: string;
  data: string;
}

export interface StreamCloseEvent {
  streamId: string;
  reason: string | null;
  exitStatus: number | null;
}

export interface NativeSubscription {
  remove(): void;
}

export interface NativeSshBridge {
  generateKey(alias: string): Promise<string>;
  publicKey(alias: string): Promise<string | null>;
  deleteKey(alias: string): Promise<void>;

  connect(host: string, port: number, timeoutMs: number): Promise<NativeHello>;
  authenticate(
    sessionId: string,
    username: string,
    keyAlias: string,
    timeoutMs: number,
  ): Promise<void>;
  disconnect(sessionId: string): Promise<void>;
  isConnected(sessionId: string): Promise<boolean>;
  exec(
    sessionId: string,
    command: string,
    input: string | null,
    timeoutMs: number,
  ): Promise<NativeExec>;
  exchangeStreamLocal(
    sessionId: string,
    socketPath: string,
    request: string,
    maxBytes: number,
    timeoutMs: number,
  ): Promise<string>;

  openStreamLocal(sessionId: string, socketPath: string, timeoutMs: number): Promise<string>;
  openPty(
    sessionId: string,
    command: string,
    term: string,
    cols: number,
    rows: number,
    timeoutMs: number,
  ): Promise<string>;
  openTcp(sessionId: string, host: string, port: number, timeoutMs: number): Promise<string>;
  startStream(streamId: string): Promise<void>;
  writeStream(streamId: string, data: string, timeoutMs: number): Promise<void>;
  resizePty(streamId: string, cols: number, rows: number, timeoutMs: number): Promise<void>;
  closeStream(streamId: string): Promise<void>;

  startForward(
    sessionId: string,
    host: string,
    port: number,
  ): Promise<{ forwardId: string; localPort: number }>;
  stopForward(forwardId: string): Promise<void>;

  sftpOpen(sessionId: string, timeoutMs: number): Promise<string>;
  sftpClose(sftpId: string): Promise<void>;
  sftpStat(
    sftpId: string,
    path: string,
    followSymlinks: boolean,
    timeoutMs: number,
  ): Promise<NativeStat | null>;
  sftpList(
    sftpId: string,
    path: string,
    query: NativeListQuery,
    timeoutMs: number,
  ): Promise<NativeListing | null>;
  sftpRead(sftpId: string, path: string, timeoutMs: number): Promise<string | null>;
  sftpReadRange(
    sftpId: string,
    path: string,
    offset: number,
    maxBytes: number,
    timeoutMs: number,
  ): Promise<{ data: string; length: number | null }>;
  sftpWrite(
    sftpId: string,
    path: string,
    data: string,
    permissions: number,
    timeoutMs: number,
  ): Promise<void>;
  sftpRename(
    sftpId: string,
    from: string,
    to: string,
    overwrite: boolean,
    timeoutMs: number,
  ): Promise<void>;
  sftpUnlink(sftpId: string, path: string, timeoutMs: number): Promise<void>;
  sftpMkdir(sftpId: string, path: string, permissions: number, timeoutMs: number): Promise<void>;
  sftpRmdir(sftpId: string, path: string, timeoutMs: number): Promise<void>;
  sftpChmod(sftpId: string, path: string, permissions: number, timeoutMs: number): Promise<void>;

  addListener(
    event: 'onStreamData',
    listener: (event: StreamDataEvent) => void,
  ): NativeSubscription;
  addListener(
    event: 'onStreamClose',
    listener: (event: StreamCloseEvent) => void,
  ): NativeSubscription;
}
