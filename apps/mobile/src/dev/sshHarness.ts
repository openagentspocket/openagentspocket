import { type SshModule, type SshSession, toSshError, utf8Decode, utf8Encode } from 'agentico-ssh';
import { check, herdr, post, tap } from './harnessIo';
import { runHerdrLive } from './herdrLive';

/**
 * The SSH module's integration run (dev only): every primitive against a local sshd + herdr
 * backend and the harness fixture (modules/ssh/scripts/harness-fixture.py). Each step records
 * ok/failure with a short detail; the report is posted back to the fixture as evidence.
 */

export interface HarnessParams {
  host: string;
  port: number;
  user: string;
  herdrSocket: string;
  fixtureSocket: string;
  fixturePort: number;
  /** Expected Host Key fingerprint (from the backend's status), checked against TOFU. */
  pin?: string;
  alias: string;
}

export interface StepResult {
  name: string;
  ok: boolean;
  ms: number;
  detail: string;
}

const MIN_PROTOCOL = 17;
const MiB = 1_048_576;

/**
 * A fingerprint from a URL: `simctl openurl` and friends turn a literal `+` into a space, so
 * accept that, and the base64url alphabet (`-` and `_`), and restore standard base64.
 */
export function normalizePin(pin: string | undefined): string | undefined {
  const fixed = pin?.trim().replace(/[ -]/g, '+').replace(/_/g, '/');
  return fixed || undefined;
}

/** Reads the route's query; null when a required value is missing. */
export function harnessParams(query: Record<string, string | undefined>): HarnessParams | null {
  const { host, user, sock, fsock } = query;
  const port = Number(query.port);
  const fixturePort = Number(query.fport);
  if (!host || !user || !sock || !fsock || !port || !fixturePort) return null;
  return {
    host,
    port,
    user,
    herdrSocket: sock,
    fixtureSocket: fsock,
    fixturePort,
    pin: normalizePin(query.pin),
    alias: query.alias || 'harness',
  };
}

export async function runSshHarness(
  ssh: SshModule,
  params: HarnessParams,
  onStep: (step: StepResult) => void,
): Promise<StepResult[]> {
  const results: StepResult[] = [];
  const step = async (name: string, run: () => Promise<string>) => {
    const started = Date.now();
    let result: StepResult;
    try {
      const detail = await run();
      result = { name, ok: true, ms: Date.now() - started, detail };
    } catch (error) {
      const e = toSshError(error);
      result = { name, ok: false, ms: Date.now() - started, detail: `${e.code}: ${e.message}` };
    }
    results.push(result);
    onStep(result);
    post(params.fixturePort, '/log', JSON.stringify(result)).catch(() => {});
    return result.ok;
  };
  const target = { host: params.host, port: params.port, username: params.user };
  const keyAlias = params.alias;
  let session: SshSession | undefined;
  const live = () => {
    check(session, 'no session');
    return session;
  };

  await step('key: generate in Keychain, authorize on the Host', async () => {
    const { publicKey } = await ssh.generateKey(keyAlias);
    check(publicKey.startsWith('ssh-ed25519 '), 'not an ed25519 public line');
    check((await ssh.generateKey(keyAlias)).publicKey === publicKey, 'key changed on reload');
    await post(params.fixturePort, '/authorize', publicKey);
    return publicKey.slice(0, 32);
  });

  await step('connect: wrong pin refused before auth', async () => {
    const code = await ssh
      .connect({ ...target, keyAlias, pinnedHostKey: 'SHA256:not-this-host' })
      .then(
        () => 'connected',
        (e) => toSshError(e).code,
      );
    check(code === 'hostKeyMismatch', `got ${code}`);
    return code;
  });

  const connected = await step('connect: TOFU fingerprint + ed25519 auth', async () => {
    let offered = '';
    session = await ssh.connect({
      ...target,
      keyAlias,
      confirmHostKey: (key) => {
        offered = key.fingerprint;
        return true;
      },
    });
    check(offered === session.hostKey.fingerprint, 'confirmed key differs from the session key');
    check(!params.pin || params.pin === offered, `fingerprint ${offered} != ${params.pin}`);
    return `${session.hostKey.algorithm} ${offered} ${session.serverIdentification ?? ''}`;
  });
  if (!connected) return results;

  await step('connect: pinned reconnect', async () => {
    const pinned = await ssh.connect({
      ...target,
      keyAlias,
      pinnedHostKey: live().hostKey.fingerprint,
    });
    await pinned.disconnect();
    return 'ok';
  });

  await step('exec: echo ok', async () => {
    const result = await live().exec('echo ok');
    check(result.exitCode === 0 && result.stdout === 'ok\n', JSON.stringify(result));
    return `exit ${result.exitCode}, stdout ${JSON.stringify(result.stdout)}`;
  });

  await step(`herdr ping over direct-streamlocal (protocol >= ${MIN_PROTOCOL})`, async () => {
    const { result } = await herdr(live(), params.herdrSocket, 'ping');
    const protocol = Number(result?.protocol);
    check(protocol >= MIN_PROTOCOL, `protocol ${result?.protocol}`);
    return `herdr ${result?.version} protocol ${protocol}`;
  });

  await step('herdr session.snapshot parses', async () => {
    const { result, bytes } = await herdr(live(), params.herdrSocket, 'session.snapshot');
    check(result && typeof result === 'object', 'no result');
    return `${bytes} bytes, keys ${Object.keys(result).slice(0, 6).join(',')}`;
  });

  await step('herdr live: transport connect, snapshot, one event', () => runHerdrLive(ssh, params));

  await step('streamlocal response bound keeps the connection', async () => {
    const code = await herdr(live(), params.herdrSocket, 'session.snapshot', {}, 64).then(
      () => 'answered',
      (e) => toSshError(e).code,
    );
    check(code === 'responseTooLarge', `got ${code}`);
    const { result } = await herdr(live(), params.herdrSocket, 'ping');
    check(Number(result?.protocol) >= MIN_PROTOCOL, 'ping after bound failed');
    return `${code}, then ping ok`;
  });

  await step('streamlocal one-shot >= 1 MiB response', async () => {
    const size = MiB + 151_424;
    const response = await live().exchangeStreamLocal(
      params.fixtureSocket,
      utf8Encode(`big ${size}\n`),
      { maxResponseBytes: 2 * MiB },
    );
    check(response.length === size + 1, `got ${response.length} bytes`);
    return `${response.length} bytes`;
  });

  await step('streamlocal duplex >= 1 MiB read', async () => {
    const size = MiB + 51_424;
    const stream = await live().openStreamLocal(params.fixtureSocket);
    const reader = tap(stream);
    await stream.write(utf8Encode(`stream ${size}\n`));
    await reader.waitFor((t) => t.closed(), 30_000);
    check(reader.bytes() === size, `got ${reader.bytes()} bytes`);
    return `${reader.bytes()} bytes, then remote EOF`;
  });

  await step('streamlocal duplex: herdr events.subscribe ack', async () => {
    const stream = await live().openStreamLocal(params.herdrSocket);
    const reader = tap(stream);
    const id = `sub-${Date.now()}`;
    const subscriptions = [{ type: 'workspace.created' }];
    await stream.write(
      utf8Encode(
        `${JSON.stringify({ id, method: 'events.subscribe', params: { subscriptions } })}\n`,
      ),
    );
    await reader.waitFor((t) => t.text().includes('\n'));
    const ack = JSON.parse(reader.text().split('\n')[0] ?? '');
    check(ack.id === id && !ack.error, reader.text().slice(0, 120));
    await stream.close();
    return reader.text().split('\n')[0]?.slice(0, 80) ?? '';
  });

  await step('exec >= 1 MiB stdout', async () => {
    const size = MiB + 51_424;
    const result = await live().exec(`head -c ${size} /dev/zero | tr '\\000' a`);
    check(result.stdout.length === size, `got ${result.stdout.length}`);
    return `${result.stdout.length} bytes`;
  });

  await step('pty: echo, resize, exit status', async () => {
    const pty = await live().openPty({ command: '/bin/sh', cols: 80, rows: 24 });
    const reader = tap(pty);
    await pty.write(utf8Encode('echo pty-$((6*7))\n'));
    await reader.waitFor((t) => t.text().includes('pty-42'));
    await pty.resize(100, 30);
    await pty.write(utf8Encode('stty size\n'));
    await reader.waitFor((t) => t.text().includes('30 100'));
    await pty.write(utf8Encode('exit 3\n'));
    await reader.waitFor((t) => t.closed());
    check(pty.exitStatus === 3, `exit status ${pty.exitStatus}`);
    return `echo + stty "30 100" + exit ${pty.exitStatus}`;
  });

  await step('sftp: mkdir, write, list, stat, read, readRange, rename, chmod, unlink', async () => {
    const home = (await live().exec('printf %s "$HOME"')).stdout;
    const sftp = await live().sftp();
    const dir = `${home}/agentico-harness-${Date.now()}`;
    await sftp.mkdir(dir);
    await sftp.write(`${dir}/a.txt`, utf8Encode('hello'));
    const again = await sftp.write(`${dir}/a.txt`, utf8Encode('x')).then(
      () => 'written',
      (e) => toSshError(e).code,
    );
    check(again === 'sftpFailure', `exclusive write gave ${again}`);
    await sftp.write(`${dir}/a.txt`, utf8Encode('hello2'), { replace: true });
    check((await sftp.stat(`${dir}/a.txt`))?.size === 6, 'stat size');
    const range = await sftp.readRange(`${dir}/a.txt`, 1, 3);
    check(utf8Decode(range.data) === 'ell' && range.length === 6, 'readRange');
    const big = new Uint8Array(MiB).fill(0x7a);
    await sftp.write(`${dir}/big.bin`, big);
    check((await sftp.read(`${dir}/big.bin`))?.length === MiB, 'read 1 MiB');
    await sftp.rename(`${dir}/a.txt`, `${dir}/b.txt`);
    const names = (await sftp.list(dir))?.entries.map((e) => e.name).join(',');
    check(names === 'b.txt,big.bin', `list ${names}`);
    await sftp.chmod(`${dir}/b.txt`, 0o600);
    for (const name of ['b.txt', 'big.bin']) await sftp.unlink(`${dir}/${name}`);
    await sftp.rmdir(dir);
    check((await sftp.stat(dir)) === null, 'dir still there');
    await sftp.close();
    return `list ${names}, 1 MiB read, cleaned up`;
  });

  await step('direct-tcpip stream to a Host port', async () => {
    const stream = await live().openTcp('127.0.0.1', params.fixturePort);
    const reader = tap(stream);
    await stream.write(utf8Encode('GET /hello HTTP/1.0\r\nHost: 127.0.0.1\r\n\r\n'));
    await reader.waitFor((t) => t.closed());
    check(/^HTTP\/1\.\d 200/.test(reader.text()) && reader.text().endsWith('hello'), 'response');
    return reader.text().split('\r\n')[0] ?? '';
  });

  await step('direct-tcpip loopback forward + fetch', async () => {
    const forward = await live().forwardLocal('127.0.0.1', params.fixturePort);
    const response = await fetch(`http://127.0.0.1:${forward.localPort}/hello`);
    const body = await response.text();
    await forward.close();
    check(response.status === 200 && body === 'hello', `${response.status} ${body}`);
    return `127.0.0.1:${forward.localPort} -> Host:${params.fixturePort} ${response.status}`;
  });

  await step('disconnect', async () => {
    await live().disconnect();
    check(!(await live().isConnected()), 'still connected');
    return 'closed';
  });

  const passed = results.filter((r) => r.ok).length;
  await post(
    params.fixturePort,
    '/report',
    JSON.stringify({ passed, total: results.length, results }, null, 2),
  ).catch(() => {});
  return results;
}
