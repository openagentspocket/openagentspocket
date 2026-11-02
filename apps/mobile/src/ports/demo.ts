import {
  createSessionHost,
  decodeUtf8,
  demoProbeOutput,
  type PortSession,
  PortsStore,
  PreviewConnection,
} from '@openagentspocket/core';
import { FakeSession } from 'agentico-ssh';
import type { PortsStoreFactory } from './registry';
import { systemClock } from './systemClock';

/**
 * An in-memory Host session for Demo mode: the discovery script's reply is a canned Linux Host
 * (a dev server, a container, system ports) framed under the request's own nonce, and the
 * forward is `FakeSession`'s.
 */
export class DemoPortSession extends FakeSession implements PortSession {
  constructor() {
    super('demo-ports', { algorithm: 'ssh-ed25519', fingerprint: 'SHA256:demo' }, {});
  }

  override async exec(_command: string, options?: { input?: Uint8Array }) {
    const script = decodeUtf8(options?.input ?? new Uint8Array());
    const nonce = /__AGENTICO_PORTS_([0-9a-f]+)__/.exec(script)?.[1] ?? '';
    return { exitCode: 0, stdout: demoProbeOutput(nonce), stderr: '' };
  }
}

/** Demo data until the SSH transport is wired: swap with `setPortsStoreFactory` at the composition root. */
export const demoPortsFactory: PortsStoreFactory = ({ hostName }) =>
  new PortsStore({
    hostName,
    host: createSessionHost(new PreviewConnection<PortSession>(async () => new DemoPortSession())),
    clock: systemClock,
  });
