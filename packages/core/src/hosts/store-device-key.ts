/** The slice of the SSH module the device key store needs; the app adapts the native client to it. */
export interface DeviceKeyPort {
  /** Loads the key under `alias`, generating it on first use; returns only the public line. */
  generateKey(alias: string): Promise<{ publicKey: string }>;
  publicKey(alias: string): Promise<string | null>;
  deleteKey(alias: string): Promise<void>;
}

export const DEFAULT_DEVICE_KEY_ALIAS = 'device-ed25519';

/**
 * The device's SSH identity per alias. The private key never leaves the native
 * module: this store only ever sees the public line, and creates the key once.
 */
export class DeviceKeyStore {
  private readonly pending = new Map<string, Promise<string>>();

  constructor(private readonly port: DeviceKeyPort) {}

  /** The public key line under `alias`, creating the key on first use. */
  publicKey(alias: string = DEFAULT_DEVICE_KEY_ALIAS): Promise<string> {
    const inFlight = this.pending.get(alias);
    if (inFlight) return inFlight;
    const task = this.load(alias).finally(() => this.pending.delete(alias));
    this.pending.set(alias, task);
    return task;
  }

  /** Replaces the key; only for a user-approved recovery, as it locks the device out of every Host. */
  async replace(alias: string = DEFAULT_DEVICE_KEY_ALIAS): Promise<string> {
    await this.port.deleteKey(alias);
    return (await this.port.generateKey(alias)).publicKey;
  }

  private async load(alias: string): Promise<string> {
    const existing = await this.port.publicKey(alias);
    if (existing !== null) return existing;
    return (await this.port.generateKey(alias)).publicKey;
  }
}

/** In-memory port for tests and previews; counts generations. */
export class MemoryDeviceKeyPort implements DeviceKeyPort {
  readonly keys = new Map<string, string>();
  generated = 0;

  async generateKey(alias: string): Promise<{ publicKey: string }> {
    let key = this.keys.get(alias);
    if (key === undefined) {
      this.generated += 1;
      key = `ssh-ed25519 MEMORY-${alias}-${this.generated}`;
      this.keys.set(alias, key);
    }
    return { publicKey: key };
  }

  async publicKey(alias: string): Promise<string | null> {
    return this.keys.get(alias) ?? null;
  }

  async deleteKey(alias: string): Promise<void> {
    this.keys.delete(alias);
  }
}
