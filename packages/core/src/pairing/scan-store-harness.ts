import type { PairingResult } from './ceremony';
import { decodePairingCode, type PairingCode } from './code';
import { FakePairingConnector, type FakePairingOutcome } from './fake-connector';
import { MemoryPairingCatalog } from './memory-catalog';
import { type PairingDeviceKeyLoad, PairingScanStore } from './scan-store';
import { scriptedDeviceKey } from './scripted-ssh';

// Test support for the scan store suites, riding on the shared vectors.

interface VectorFile {
  readonly valid: readonly {
    code: string;
    payload: { bootstrapSeed?: string; socketPath?: string };
  }[];
}

function codeWhere(file: VectorFile, test: (seed: boolean, socket: boolean) => boolean): string {
  const found = file.valid.find((vector) =>
    test(vector.payload.bootstrapSeed !== undefined, vector.payload.socketPath !== undefined),
  );
  if (found === undefined) throw new Error('missing vector');
  return found.code;
}

/** The scanned codes the store suites use, taken from the shared vector files. */
export function vectorCodes(v1: VectorFile, v2: VectorFile) {
  return {
    /** A canonical config-only code. */
    configOnly: v1.valid[0]?.code ?? '',
    /** Three addresses, port 2222, user grace. */
    multiAddress: v1.valid[1]?.code ?? '',
    /** Carries a Bootstrap Key that expires at 1753305600 (10.0.0.7, user lin). */
    bootstrap: codeWhere(v1, (seed) => seed),
    /** Bootstrap Key and Herdr Endpoint, same Host and expiry as `bootstrap`. */
    endpoint: codeWhere(v2, (seed, socket) => seed && socket),
  };
}

/** Milliseconds safely inside the bootstrap vectors' TTL. */
export const INSIDE_TTL_MS = 1_753_305_500_000;

export const PRESENTED = 'SHA256:6+jncNdibsG2cqvfoLApGrO8CvIwAEMzsB+IilOs8tg';
export const PAIRED_RESULT: PairingResult = {
  address: '10.0.0.7',
  port: 22,
  username: 'lin',
  hostKeyFingerprint: PRESENTED,
};

export function decoded(scanned: string): PairingCode {
  const result = decodePairingCode(scanned);
  if (!result.ok) throw new Error(`vector did not decode: ${result.error.code}`);
  return result.code;
}

export interface Env {
  readonly store: PairingScanStore;
  readonly connector: FakePairingConnector;
  readonly catalog: MemoryPairingCatalog;
  readonly deviceKey: ReturnType<typeof scriptedDeviceKey>;
}

export function makeEnv(
  options: {
    outcomes?: FakePairingOutcome[];
    nowMs?: number;
    deviceKeyLoad?: PairingDeviceKeyLoad | 'throws';
  } = {},
): Env {
  const connector = new FakePairingConnector(options.outcomes ?? [{ succeeds: PAIRED_RESULT }]);
  const catalog = new MemoryPairingCatalog();
  const deviceKey = scriptedDeviceKey();
  const load = options.deviceKeyLoad ?? { ok: true, key: deviceKey };
  const store = new PairingScanStore({
    connector,
    catalog,
    loadDeviceKey: async () => {
      if (load === 'throws') throw new Error('secure storage unavailable');
      return load;
    },
    now: () => options.nowMs ?? INSIDE_TTL_MS,
  });
  return { store, connector, catalog, deviceKey };
}
