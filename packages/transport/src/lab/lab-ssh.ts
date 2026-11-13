// The agent lab's SSH session (scripts/agent-lab.py): the app's `SshSession` over the OpenSSH
// client, so `SshTransport` and everything above it run unchanged against the lab's sshd. Exec is
// an exec channel and herdr requests are direct-streamlocal channels (one ControlMaster forward per
// socket), as on the phone. SFTP is the one stand-in: the lab is on this machine, so its files are
// read from disk, refusing any path outside the lab root. Node only; never part of the app.

import { type ChildProcess, spawn } from 'node:child_process';
import { lstat, open, readdir, rm, stat } from 'node:fs/promises';
import { connect, type Socket } from 'node:net';
import { join } from 'node:path';
import type {
  ExecOptions,
  ExecResult,
  Sftp,
  SftpKind,
  SftpListOptions,
  SftpStat,
  SshSession,
  Stream,
} from 'agentico-ssh';

export interface LabState {
  root: string;
  user: string;
  ssh_port: number;
  programs: string[];
  agents: Record<string, { name: string; pane: string }>;
}

const decoder = new TextDecoder();

function run(command: string, args: string[], input?: Uint8Array, timeoutMs = 30_000) {
  return new Promise<{ code: number; stdout: Buffer; stderr: Buffer }>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout.on('data', (chunk: Buffer) => out.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => err.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 255, stdout: Buffer.concat(out), stderr: Buffer.concat(err) });
    });
    child.stdin.end(input ? Buffer.from(input) : undefined);
  });
}

function socketStream(socket: Socket, id: string): Stream {
  return {
    id,
    write: (data) => new Promise((resolve) => socket.write(Buffer.from(data), () => resolve())),
    onData: (listener) => {
      const handler = (chunk: Buffer) => listener(new Uint8Array(chunk));
      socket.on('data', handler);
      return () => socket.off('data', handler);
    },
    onClose: (listener) => {
      const handler = () => listener();
      socket.on('close', handler);
      return () => socket.off('close', handler);
    },
    close: async () => {
      socket.end();
    },
  };
}

export class LabSshSession implements SshSession {
  readonly sessionId = 'agent-lab';
  readonly hostKey = { algorithm: 'ssh-ed25519', fingerprint: 'lab', publicKey: '' } as never;
  private readonly control: string;
  private readonly forwards = new Map<string, string>();
  private master: ChildProcess | undefined;

  constructor(private readonly lab: LabState) {
    this.control = join(lab.root, 'tmp', 'ctl');
  }

  private base(): string[] {
    const { root, ssh_port, user } = this.lab;
    return [
      '-F',
      '/dev/null',
      '-i',
      join(root, 'ssh/client_ed25519'),
      '-p',
      String(ssh_port),
      '-o',
      `UserKnownHostsFile=${join(root, 'ssh/known_hosts')}`,
      '-o',
      'IdentitiesOnly=yes',
      '-o',
      'BatchMode=yes',
      '-S',
      this.control,
      `${user}@127.0.0.1`,
    ];
  }

  /** Opens the master connection every channel multiplexes over. */
  async start(): Promise<void> {
    this.master = spawn('ssh', ['-M', '-N', ...this.base()], { stdio: 'ignore' });
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if ((await run('ssh', ['-O', 'check', ...this.base()])).code === 0) return;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error('the lab ssh master did not come up');
  }

  async exec(command: string, options: ExecOptions = {}): Promise<ExecResult> {
    const done = await run('ssh', [...this.base(), command], options.input, options.timeoutMs);
    return {
      exitCode: done.code,
      stdout: decoder.decode(done.stdout),
      stderr: decoder.decode(done.stderr),
    };
  }

  private async forward(socketPath: string): Promise<string> {
    const known = this.forwards.get(socketPath);
    if (known) return known;
    const local = join(this.lab.root, 'tmp', `f${process.pid}-${this.forwards.size}.sock`);
    const done = await run('ssh', [
      '-O',
      'forward',
      '-L',
      `${local}:${socketPath}`,
      ...this.base(),
    ]);
    if (done.code !== 0)
      throw new Error(`streamlocal forward failed: ${decoder.decode(done.stderr)}`);
    this.forwards.set(socketPath, local);
    return local;
  }

  async exchangeStreamLocal(socketPath: string, request: Uint8Array): Promise<Uint8Array> {
    const local = await this.forward(socketPath);
    return new Promise((resolve, reject) => {
      const socket = connect(local);
      const chunks: Buffer[] = [];
      const finish = () => resolve(new Uint8Array(Buffer.concat(chunks)));
      socket.on('connect', () => socket.write(Buffer.from(request)));
      socket.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
        if (chunk.includes(10)) {
          socket.end();
          finish();
        }
      });
      socket.on('end', finish);
      socket.on('error', reject);
    });
  }

  async openStreamLocal(socketPath: string): Promise<Stream> {
    const socket = connect(await this.forward(socketPath));
    await new Promise((resolve, reject) => socket.once('connect', resolve).once('error', reject));
    return socketStream(socket, `lab-${socketPath}`);
  }

  async sftp(): Promise<Sftp> {
    return labFiles(this.lab.root);
  }

  openPty(): never {
    throw new Error('the lab session has no PTY');
  }

  openTcp(): never {
    throw new Error('the lab session has no TCP channels');
  }

  forwardLocal(): never {
    throw new Error('the lab session has no TCP forwards');
  }

  async isConnected(): Promise<boolean> {
    return this.master !== undefined && this.master.exitCode === null;
  }

  async disconnect(): Promise<void> {
    await run('ssh', ['-O', 'exit', ...this.base()]).catch(() => undefined);
    this.master?.kill();
    this.master = undefined;
    await Promise.all([...this.forwards.values()].map((local) => rm(local, { force: true })));
    this.forwards.clear();
  }
}

function kindOf(entry: {
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}): SftpKind {
  if (entry.isSymbolicLink()) return 'symlink';
  if (entry.isDirectory()) return 'directory';
  return entry.isFile() ? 'file' : 'other';
}

/** Read-only file access under the lab root, with SFTP's shapes. */
function labFiles(root: string): Sftp {
  const inside = (path: string) => {
    const real = path.replace(/^\/private\//, '/');
    if (!real.startsWith(`${root.replace(/^\/private\//, '/')}/`)) {
      throw new Error(`the lab reads only under ${root}: ${path}`);
    }
    return path;
  };
  const statOf = async (path: string, follow = true): Promise<SftpStat | null> => {
    const info = await (follow ? stat : lstat)(inside(path)).catch(() => null);
    return info
      ? { kind: kindOf(info), size: info.size, modifiedAt: Math.floor(info.mtimeMs / 1000) }
      : null;
  };
  const refuse = async (): Promise<never> => {
    throw new Error('the lab files are read-only');
  };
  return {
    stat: (path, options) => statOf(path, options?.followSymlinks ?? true),
    list: async (path, options: SftpListOptions = {}) => {
      const entries = await readdir(inside(path), { withFileTypes: true }).catch(() => null);
      if (!entries) return null;
      const matching = entries
        .filter((entry) => !options.kinds || options.kinds.includes(kindOf(entry)))
        .filter((entry) => !options.namePrefix || entry.name.startsWith(options.namePrefix))
        .filter(
          (entry) =>
            !options.nameSuffixes || options.nameSuffixes.some((s) => entry.name.endsWith(s)),
        )
        .filter((entry) => !options.nameContains || entry.name.includes(options.nameContains))
        .sort((a, b) => (a.name < b.name ? -1 : 1));
      const limit = options.maxEntries ?? 500;
      return {
        entries: matching.slice(0, limit).map((entry) => ({
          name: entry.name,
          isDirectory: entry.isDirectory(),
          kind: kindOf(entry),
          size: null,
          modifiedAt: null,
        })),
        truncated: matching.length > limit,
        scanIncomplete: false,
      };
    },
    read: async (path) => {
      const handle = await open(inside(path), 'r').catch(() => null);
      if (!handle) return null;
      try {
        return new Uint8Array(await handle.readFile());
      } finally {
        await handle.close();
      }
    },
    readRange: async (path, offset, maxBytes) => {
      const handle = await open(inside(path), 'r').catch(() => null);
      if (!handle) return { data: new Uint8Array(), length: null };
      try {
        const { size } = await handle.stat();
        const buffer = Buffer.alloc(Math.max(0, Math.min(maxBytes, size - offset)));
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset);
        return { data: new Uint8Array(buffer.subarray(0, bytesRead)), length: size };
      } finally {
        await handle.close();
      }
    },
    write: refuse,
    rename: refuse,
    unlink: refuse,
    mkdir: refuse,
    rmdir: refuse,
    chmod: refuse,
    close: async () => undefined,
  };
}
