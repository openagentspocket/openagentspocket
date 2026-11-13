import { describe, expect, it } from 'vitest';
import { decodeUtf8 } from '../../events/utf8';
import { storeQueryRunner } from './host-query';
import type { ChatStore } from './query';

const store = {
  script: (_query: unknown, nonce: string) => new TextEncoder().encode(`echo ${nonce}`),
} as unknown as ChatStore;

describe('storeQueryRunner', () => {
  it("takes each query's nonce from the random source it is given, which on Hermes is the device's secure bytes (it has no Web Crypto)", async () => {
    const scripts: string[] = [];
    const asked: number[] = [];
    const run = storeQueryRunner(
      async (script) => {
        scripts.push(decodeUtf8(script));
        return { stdout: new Uint8Array(), stderr: new Uint8Array(), exitStatus: 1 };
      },
      {
        random: (length) => {
          asked.push(length);
          return new Uint8Array(length).fill(0xab);
        },
      },
    );
    await run(store, { kind: 'probe' } as never).catch(() => undefined);
    expect(asked).toEqual([12]);
    expect(scripts).toEqual([`echo ${'ab'.repeat(12)}`]);
  });
});
