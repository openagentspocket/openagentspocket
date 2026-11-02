import { utf8Decode, utf8Encode } from './bytes';
import {
  type PairingDeviceKey,
  type PairingDial,
  type PairingIdentity,
  type PairingSSHConnection,
  PairingSSHError,
  type PairingSSHFailureKind,
} from './connector';

/** How one scripted candidate address behaves. Test support for the ceremony client. */
export interface ScriptedCandidate {
  /** Dial failure; the dial succeeds when absent. */
  readonly dialError?: PairingSSHFailureKind;
  readonly hostKey?: string;
  /** The host key a later dial (the verify reconnect) presents, if it changed. */
  readonly laterHostKey?: string;
  readonly banner?: string | null;
  /** Authentication outcome per identity kind; `ok` when absent. */
  readonly bootstrapAuth?: 'ok' | PairingSSHFailureKind;
  readonly deviceAuth?: 'ok' | PairingSSHFailureKind;
  /** The Enrollment exchange: the raw stdout to answer with, or an SSH failure. */
  readonly enroll?: { readonly respond: string } | { readonly fail: PairingSSHFailureKind };
}

export interface ScriptedEvent {
  readonly op: 'dial' | 'auth' | 'exec' | 'close';
  readonly address: string;
  readonly detail?: string;
}

/** A scripted SSH world for the ceremony client: candidates by address, plus a log of every call. */
export class ScriptedSSH {
  readonly events: ScriptedEvent[] = [];
  readonly enrollmentInputs: string[] = [];
  readonly bootstrapSeeds: Uint8Array[] = [];
  readonly seenBanners: (string | null)[] = [];
  private readonly dials = new Map<string, number>();

  constructor(private readonly candidates: Record<string, ScriptedCandidate>) {}

  ops(op: ScriptedEvent['op']): string[] {
    return this.events.filter((e) => e.op === op).map((e) => `${e.address}${e.detail ?? ''}`);
  }

  readonly dial: PairingDial = async ({ host }) => {
    this.events.push({ op: 'dial', address: host });
    const script = this.candidates[host];
    if (script === undefined) throw new PairingSSHError('other', 'connection refused');
    if (script.dialError) throw new PairingSSHError(script.dialError);
    const count = (this.dials.get(host) ?? 0) + 1;
    this.dials.set(host, count);
    const hostKey = (count > 1 ? script.laterHostKey : undefined) ?? script.hostKey ?? '';
    return this.connection(host, script, hostKey);
  };

  private connection(
    address: string,
    script: ScriptedCandidate,
    hostKeyFingerprint: string,
  ): PairingSSHConnection {
    const world = this;
    const banner = script.banner === undefined ? 'SSH-2.0-OpenSSH_9.9' : script.banner;
    return {
      hostKeyFingerprint,
      get serverIdentification() {
        world.seenBanners.push(banner);
        return banner;
      },
      async authenticate(_username: string, identity: PairingIdentity) {
        world.events.push({ op: 'auth', address, detail: ` ${identity.kind}` });
        if (identity.kind === 'bootstrap') world.bootstrapSeeds.push(identity.seed);
        const outcome = identity.kind === 'bootstrap' ? script.bootstrapAuth : script.deviceAuth;
        if (outcome && outcome !== 'ok') throw new PairingSSHError(outcome);
      },
      async executeResponseLine(command: string, input: Uint8Array) {
        world.events.push({ op: 'exec', address, detail: ` ${command}` });
        world.enrollmentInputs.push(utf8Decode(input));
        const enroll = script.enroll;
        if (enroll === undefined || 'fail' in enroll) {
          throw new PairingSSHError(enroll?.fail ?? 'unexpectedEOF');
        }
        return utf8Encode(enroll.respond);
      },
      async close() {
        world.events.push({ op: 'close', address });
      },
    };
  }
}

/** A Device Key stand-in with a fixed public line and fingerprint. */
export function scriptedDeviceKey(
  fingerprint = 'SHA256:0Y1eCbGuGWCGKirP9nWzOTLIcuBLvewToJfOPQqrjHY',
  publicLine = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeDeviceKeyForTests',
): PairingDeviceKey {
  return { fingerprint, authorizedKeysLine: (comment) => `${publicLine} ${comment}` };
}
