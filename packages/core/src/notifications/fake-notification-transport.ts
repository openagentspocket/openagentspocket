import { type Host, hostRoute } from '../hosts/host';
import { utf8Decode, utf8Encode } from '../pairing/bytes';
import { NotificationRegistrationError } from './errors';
import type { NotificationTransport } from './transport';

/**
 * An in-memory Host for tests and previews: the two files, a write log, and failure injection.
 * `unreachable` makes every call throw, `failWrites` only the replaces.
 */
export class FakeNotificationTransport implements NotificationTransport {
  registration: Uint8Array | null = null;
  config: Uint8Array | null = null;
  /** Names of replaced files, in order. */
  readonly writes: ('registration' | 'config')[] = [];
  reads = 0;
  unreachable: Error | null = null;
  failWrites = false;
  /** When set, replaceRegistration waits for it, then writes. */
  holdRegistrationWrites: Promise<void> | null = null;

  constructor(registration?: string) {
    if (registration !== undefined) this.registration = utf8Encode(registration);
  }

  get registrationText(): string | null {
    return this.registration === null ? null : utf8Decode(this.registration);
  }

  get registrationJson(): unknown {
    return this.registrationText === null ? null : JSON.parse(this.registrationText);
  }

  get configJson(): unknown {
    return this.config === null ? null : JSON.parse(utf8Decode(this.config));
  }

  async readRegistration(): Promise<Uint8Array | null> {
    this.check();
    this.reads += 1;
    return this.registration;
  }

  async replaceRegistration(data: Uint8Array): Promise<void> {
    this.check();
    this.checkWrite();
    await this.holdRegistrationWrites;
    this.registration = data;
    this.writes.push('registration');
  }

  async readConfig(): Promise<Uint8Array | null> {
    this.check();
    return this.config;
  }

  async replaceConfig(data: Uint8Array): Promise<void> {
    this.check();
    this.checkWrite();
    this.config = data;
    this.writes.push('config');
  }

  private check(): void {
    if (this.unreachable) throw this.unreachable;
  }

  private checkWrite(): void {
    if (this.failWrites) {
      throw new NotificationRegistrationError({ kind: 'writeFailed', detail: 'injected' });
    }
  }
}

/** A Host with the given id and defaults, for tests and previews. */
export const makeHost = (id: string, fields: Partial<Host> = {}): Host => ({
  id,
  name: `Host ${id}`,
  username: 'dev',
  authMethod: 'deviceKey',
  sessionName: '',
  herdrEndpoint: null,
  routes: [hostRoute({ id: `${id}-r`, address: `${id}.example` })],
  ...fields,
});
