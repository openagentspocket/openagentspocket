import type {
  ConnectOptions,
  ExecResult,
  LocalForward,
  PtyOptions,
  PtyStream,
  Sftp,
  SftpEntry,
  SshModule,
  SshSession,
  Stream,
} from './types';

type Listener<T> = (value: T) => void;

class FakeStream implements Stream {
  readonly written: Uint8Array[] = [];
  private dataListeners = new Set<Listener<Uint8Array>>();
  private closeListeners = new Set<Listener<string | undefined>>();
  closed = false;

  constructor(readonly id: string) {}

  async write(data: Uint8Array) {
    this.written.push(data);
  }
  onData(listener: Listener<Uint8Array>) {
    this.dataListeners.add(listener);
    return () => this.dataListeners.delete(listener);
  }
  onClose(listener: Listener<string | undefined>) {
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }
  async close() {
    this.closed = true;
    for (const listener of this.closeListeners) listener(undefined);
  }
  /** Test helper: the remote side sends bytes. */
  emit(data: Uint8Array) {
    for (const listener of this.dataListeners) listener(data);
  }
}

class FakePty extends FakeStream implements PtyStream {
  size = { cols: 0, rows: 0 };
  async resize(cols: number, rows: number) {
    this.size = { cols, rows };
  }
}

export interface FakeSshOptions {
  /** Canned results by exact command. */
  exec?: Record<string, ExecResult>;
  files?: Record<string, Uint8Array>;
  hostKeyFingerprint?: string;
}

export class FakeSsh implements SshModule {
  readonly keys = new Map<string, string>();
  readonly sessions: FakeSession[] = [];

  constructor(private readonly options: FakeSshOptions = {}) {}

  async generateKey(alias: string) {
    const publicKey = `ssh-ed25519 FAKE-${alias}`;
    this.keys.set(alias, publicKey);
    return { publicKey };
  }

  async connect(options: ConnectOptions) {
    if (!this.keys.has(options.keyAlias)) throw new Error(`unknown key alias: ${options.keyAlias}`);
    const fingerprint = this.options.hostKeyFingerprint ?? 'SHA256:fake';
    if (options.pinnedHostKey && options.pinnedHostKey !== fingerprint) {
      throw new Error('host key mismatch');
    }
    const session = new FakeSession(`fake-${this.sessions.length + 1}`, fingerprint, this.options);
    this.sessions.push(session);
    return session;
  }
}

export class FakeSession implements SshSession {
  readonly streams: FakeStream[] = [];
  connected = true;

  constructor(
    readonly sessionId: string,
    readonly hostKeyFingerprint: string,
    private readonly options: FakeSshOptions,
  ) {}

  async exec(command: string): Promise<ExecResult> {
    return this.options.exec?.[command] ?? { exitCode: 127, stdout: '', stderr: 'not found' };
  }
  async openPty(options: PtyOptions): Promise<PtyStream> {
    const pty = new FakePty(`pty-${this.streams.length + 1}`);
    pty.size = { cols: options.cols, rows: options.rows };
    this.streams.push(pty);
    return pty;
  }
  async openStreamLocal(_socketPath: string): Promise<Stream> {
    const stream = new FakeStream(`sock-${this.streams.length + 1}`);
    this.streams.push(stream);
    return stream;
  }
  async sftp(): Promise<Sftp> {
    const files = new Map(Object.entries(this.options.files ?? {}));
    return {
      list: async (path): Promise<SftpEntry[]> =>
        [...files.keys()]
          .filter((name) => name.startsWith(`${path}/`))
          .map((name) => ({
            name: name.slice(path.length + 1),
            isDirectory: false,
            size: files.get(name)?.length ?? 0,
            modifiedAt: 0,
          })),
      read: async (path) => {
        const data = files.get(path);
        if (!data) throw new Error(`no such file: ${path}`);
        return data;
      },
      write: async (path, data) => {
        files.set(path, data);
      },
      remove: async (path) => {
        files.delete(path);
      },
    };
  }
  async forwardLocal(_remoteHost: string, _remotePort: number): Promise<LocalForward> {
    return { localPort: 49152, close: async () => {} };
  }
  async disconnect() {
    this.connected = false;
  }
}
