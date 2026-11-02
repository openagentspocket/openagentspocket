import { checkHostKey, DEFAULT_MAX_RESPONSE_BYTES, resolveCredential } from './client';
import { SshError } from './errors';
import { fakeSftp } from './fakeSftp';
import type {
  ConnectOptions,
  ExecResult,
  HostKey,
  LocalForward,
  PtyOptions,
  PtyStream,
  Sftp,
  SshCredential,
  SshModule,
  SshSession,
  Stream,
} from './types';

type Listener<T> = (value: T) => void;

export class FakeStream implements Stream {
  readonly written: Uint8Array[] = [];
  private dataListeners = new Set<Listener<Uint8Array>>();
  private closeListeners = new Set<Listener<string | undefined>>();
  closed = false;

  constructor(readonly id: string) {}

  async write(data: Uint8Array) {
    if (this.closed) throw new SshError('closed');
    this.written.push(data);
  }
  onData(listener: Listener<Uint8Array>) {
    this.dataListeners.add(listener);
    return () => this.dataListeners.delete(listener);
  }
  onClose(listener: Listener<string | undefined>) {
    if (this.closed) {
      listener(undefined);
      return () => {};
    }
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }
  async close() {
    this.end(undefined);
  }
  /** Test helper: the remote side sends bytes. */
  emit(data: Uint8Array) {
    if (!this.closed) for (const listener of this.dataListeners) listener(data);
  }
  /** Test helper: the remote side ends the stream (a reason code when it failed). */
  end(reason?: string) {
    if (this.closed) return;
    this.closed = true;
    for (const listener of this.closeListeners) listener(reason);
  }
}

export class FakePty extends FakeStream implements PtyStream {
  size = { cols: 0, rows: 0 };
  exitStatus: number | undefined;
  async resize(cols: number, rows: number) {
    if (this.closed) throw new SshError('closed');
    this.size = { cols, rows };
  }
}

export interface FakeSshOptions {
  /** Canned results by exact command. */
  exec?: Record<string, ExecResult>;
  /** Answers `exchangeStreamLocal` (default: `streamLocalOpenFailed`). */
  streamLocal?: (socketPath: string, request: Uint8Array) => Uint8Array;
  files?: Record<string, Uint8Array>;
  /** Directories that exist (the parents of `files` are added). */
  directories?: string[];
  /** Modification times (Unix seconds) by path; others read as 0. */
  modified?: Record<string, number>;
  hostKey?: HostKey;
  /** Users whose key is authorized; default: any. */
  authorizedUsers?: string[];
  /** Accepted passwords by user; without this map any password is accepted. */
  passwords?: Record<string, string>;
  /** Accepted Bootstrap Key seeds; without this list any 32-byte seed is accepted. */
  bootstrapSeeds?: Uint8Array[];
  /** Accepted RSA private keys (PEM text); without this list any readable key is accepted. */
  rsaKeys?: string[];
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, index) => byte === b[index]);
}

/** An in-memory `SshModule` for tests and Demo mode, with the native module's semantics. */
export class FakeSsh implements SshModule {
  readonly keys = new Map<string, string>();
  readonly sessions: FakeSession[] = [];
  /** Every credential a connect offered after the Host Key was accepted, in order. */
  readonly credentials: SshCredential[] = [];

  constructor(private readonly options: FakeSshOptions = {}) {}

  async generateKey(alias: string) {
    const publicKey = this.keys.get(alias) ?? `ssh-ed25519 FAKE-${alias}`;
    this.keys.set(alias, publicKey);
    return { publicKey };
  }

  async publicKey(alias: string) {
    return this.keys.get(alias) ?? null;
  }

  async deleteKey(alias: string) {
    this.keys.delete(alias);
  }

  async connect(options: ConnectOptions): Promise<SshSession> {
    const hostKey = this.options.hostKey ?? {
      algorithm: 'ssh-ed25519',
      fingerprint: 'SHA256:fake',
    };
    await checkHostKey(options, hostKey);
    const credential = await resolveCredential(options);
    this.credentials.push(credential);
    this.authenticate(options.username, credential);
    const session = new FakeSession(`fake-${this.sessions.length + 1}`, hostKey, this.options);
    this.sessions.push(session);
    return session;
  }

  private authenticate(username: string, credential: SshCredential) {
    const { options } = this;
    const refuse = () => new SshError('authenticationFailed');
    switch (credential.kind) {
      case 'deviceKey': {
        if (!this.keys.has(credential.alias)) throw new SshError('keyNotFound');
        const users = options.authorizedUsers;
        if (users && !users.includes(username)) throw refuse();
        return;
      }
      case 'password': {
        const expected = options.passwords?.[username];
        if (options.passwords && expected !== credential.password) throw refuse();
        return;
      }
      case 'bootstrapSeed': {
        if (credential.seed.length !== 32) throw new SshError('invalidArgument', 'seed');
        const seeds = options.bootstrapSeeds;
        if (seeds && !seeds.some((seed) => sameBytes(seed, credential.seed))) throw refuse();
        return;
      }
      case 'rsaKey': {
        const pem = credential.privateKey;
        if (!/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(pem)) throw new SshError('keyInvalid');
        if (/ENCRYPTED/.test(pem)) throw new SshError('keyEncrypted');
        if (options.rsaKeys && !options.rsaKeys.includes(pem)) throw refuse();
        return;
      }
    }
  }
}

export class FakeSession implements SshSession {
  readonly streams: FakeStream[] = [];
  readonly files: Map<string, Uint8Array>;
  readonly directories: Set<string>;
  connected = true;

  constructor(
    readonly sessionId: string,
    readonly hostKey: HostKey,
    private readonly options: FakeSshOptions,
  ) {
    this.files = new Map(Object.entries(options.files ?? {}));
    this.directories = new Set(['/', ...(options.directories ?? [])]);
    for (const path of this.files.keys()) {
      this.directories.add(path.slice(0, Math.max(path.lastIndexOf('/'), 0)) || '/');
    }
  }

  private check() {
    if (!this.connected) throw new SshError('closed');
  }

  private track<T extends FakeStream>(stream: T): T {
    this.check();
    this.streams.push(stream);
    return stream;
  }

  async exec(command: string): Promise<ExecResult> {
    this.check();
    return this.options.exec?.[command] ?? { exitCode: 127, stdout: '', stderr: 'not found' };
  }
  async exchangeStreamLocal(
    socketPath: string,
    request: Uint8Array,
    options: { maxResponseBytes?: number } = {},
  ) {
    this.check();
    if (!this.options.streamLocal) throw new SshError('streamLocalOpenFailed');
    const response = this.options.streamLocal(socketPath, request);
    if (response.length > (options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES)) {
      throw new SshError('responseTooLarge');
    }
    return response;
  }
  async openStreamLocal(_socketPath: string): Promise<Stream> {
    return this.track(new FakeStream(`sock-${this.streams.length + 1}`));
  }
  async openPty(options: PtyOptions): Promise<PtyStream> {
    const pty = this.track(new FakePty(`pty-${this.streams.length + 1}`));
    pty.size = { cols: options.cols, rows: options.rows };
    return pty;
  }
  async openTcp(_host: string, _port: number): Promise<Stream> {
    return this.track(new FakeStream(`tcp-${this.streams.length + 1}`));
  }
  async sftp(): Promise<Sftp> {
    this.check();
    return fakeSftp(this.files, this.directories, this.options.modified);
  }
  async forwardLocal(_remoteHost: string, _remotePort: number): Promise<LocalForward> {
    this.check();
    return { localPort: 49152, close: async () => {} };
  }
  async isConnected() {
    return this.connected;
  }
  async disconnect() {
    this.connected = false;
    for (const stream of this.streams) stream.end('disconnected');
  }
}
