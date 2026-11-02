import {
  createSSHPairingConnector,
  fingerprintDisplay,
  fingerprintFromBlob,
  type PairingConnector,
  type PairingDeviceKey,
  type PairingDial,
  type PairingIdentity,
  type PairingSSHConnection,
  PairingSSHError,
  type PairingSSHFailureKind,
  type SSHPairingConnectorOptions,
} from '@openagentspocket/core';
import {
  fromBase64,
  type HostKey,
  type SshCredential,
  SshError,
  type SshModule,
  type SshSession,
  utf8Encode,
} from 'agentico-ssh';

function failureKind(error: unknown): PairingSSHFailureKind {
  if (!(error instanceof SshError)) return 'other';
  switch (error.code) {
    case 'authenticationFailed':
      return 'authenticationFailed';
    case 'timedOut':
      return 'timedOut';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'other';
  }
}

function asPairingError(error: unknown): PairingSSHError {
  if (error instanceof PairingSSHError) return error;
  return new PairingSSHError(failureKind(error), error instanceof Error ? error.message : 'ssh');
}

/** Just past the first newline, or null when there is none. */
function firstLine(text: string): string | null {
  const end = text.indexOf('\n');
  return end < 0 ? null : text.slice(0, end + 1);
}

/**
 * One ceremony connection over the SSH module. The module authenticates inside `connect`, right
 * after the host key decision, so the dial stops there: the key is reported, and the answer
 * (`authenticate` offers the identity as the connect's credential and proceeds, `close`
 * declines) releases the handshake. The Bootstrap Key's seed is offered as such.
 */
class ModuleConnection implements PairingSSHConnection {
  private authenticated = false;

  constructor(
    readonly hostKeyFingerprint: string,
    readonly serverIdentification: string | null,
    private readonly decide: (accept: boolean) => void,
    private readonly offer: (credential: SshCredential) => void,
    private readonly keyAlias: string,
    private readonly connecting: Promise<SshSession>,
  ) {}

  async authenticate(
    _username: string,
    identity: PairingIdentity,
    _timeoutMs: number,
  ): Promise<void> {
    this.authenticated = true;
    this.offer(
      identity.kind === 'bootstrap'
        ? { kind: 'bootstrapSeed', seed: identity.seed }
        : { kind: 'deviceKey', alias: this.keyAlias },
    );
    this.decide(true);
    try {
      await this.connecting;
    } catch (error) {
      throw asPairingError(error);
    }
  }

  async executeResponseLine(
    command: string,
    input: Uint8Array,
    maximumResponseBytes: number,
    timeoutMs: number,
  ): Promise<Uint8Array> {
    if (!this.authenticated) throw new PairingSSHError('other', 'not authenticated');
    try {
      const session = await this.connecting;
      const result = await session.exec(command, { input, timeoutMs });
      const line = firstLine(result.stdout);
      if (line === null) throw new PairingSSHError('unexpectedEOF');
      const bytes = utf8Encode(line);
      if (bytes.length > maximumResponseBytes) throw new PairingSSHError('other', 'too large');
      return bytes;
    } catch (error) {
      throw asPairingError(error);
    }
  }

  async close(_timeoutMs: number): Promise<void> {
    this.decide(false);
    const session = await this.connecting.catch(() => null);
    await session?.disconnect();
  }
}

export interface PairingDialOptions {
  readonly ssh: SshModule;
  readonly keyAlias: string;
  /** The account to log in as: the module needs it at connect, the dial does not receive it. */
  readonly username: () => string;
}

/**
 * The `PairingDial` over the SSH module. It resolves with the host key the server presented and
 * leaves authentication pending until the ceremony decides.
 */
export function createModuleDial(options: PairingDialOptions): PairingDial {
  return async (endpoint, timeoutMs) => {
    let decide!: (accept: boolean) => void;
    const decision = new Promise<boolean>((resolve) => {
      decide = resolve;
    });
    let offer!: (credential: SshCredential) => void;
    const credential = new Promise<SshCredential>((resolve) => {
      offer = resolve;
    });
    let presented!: (key: HostKey) => void;
    let failed!: (error: unknown) => void;
    const keyArrived = new Promise<HostKey>((resolve, reject) => {
      presented = resolve;
      failed = reject;
    });
    const connecting = options.ssh.connect({
      host: endpoint.host,
      port: endpoint.port,
      username: options.username(),
      credential: () => credential,
      timeoutMs,
      confirmHostKey: (key) => {
        presented(key);
        return decision;
      },
    });
    connecting.catch(failed);
    const key = await keyArrived.catch((error: unknown) => {
      throw asPairingError(error);
    });
    return new ModuleConnection(key.fingerprint, null, decide, offer, options.keyAlias, connecting);
  };
}

/** A connector whose dial logs in as the code's account. */
export function createModuleConnector(
  options: Omit<PairingDialOptions, 'username'> &
    Pick<SSHPairingConnectorOptions, 'perAddressTimeoutMs' | 'enrollTimeoutMs'>,
): PairingConnector {
  let username = '';
  const inner = createSSHPairingConnector({
    ...options,
    dial: createModuleDial({ ...options, username: () => username }),
  });
  return {
    pair: (code, deviceKey, onStep, cancellation) => {
      username = code.username;
      return inner.pair(code, deviceKey, onStep, cancellation);
    },
  };
}

/** `ssh-ed25519 <base64> [comment]` as the ceremony's device key. */
export function pairingDeviceKey(publicKeyLine: string): PairingDeviceKey {
  const [algorithm, body] = publicKeyLine.trim().split(/\s+/);
  const blob = fromBase64(body ?? '');
  return {
    authorizedKeysLine: (comment) => `${algorithm} ${body} ${comment}`,
    fingerprint: fingerprintDisplay(fingerprintFromBlob(blob)),
  };
}
