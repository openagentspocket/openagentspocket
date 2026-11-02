import { describe, expect, it } from 'vitest';
import type { NativeSshBridge, StreamDataEvent } from './bridge';
import { toBase64 } from './bytes';
import { StreamRouter } from './streams';

function router(writeDelays: number[] = []) {
  const written: string[] = [];
  let listener: ((event: StreamDataEvent) => void) | undefined;
  const bridge = {
    addListener: (name: string, fn: (event: StreamDataEvent) => void) => {
      if (name === 'onStreamData') listener = fn;
      return { remove: () => {} };
    },
    startStream: async () => {},
    writeStream: async (_id: string, data: string) => {
      const delay = writeDelays.shift() ?? 0;
      await new Promise<void>((resolve) => setTimeout(() => resolve(), delay));
      written.push(data);
    },
  } as unknown as NativeSshBridge;
  const stream = new StreamRouter(bridge).open('s1');
  return { stream, written, emit: (data: string) => listener?.({ streamId: 's1', data }) };
}

const bytes = (...values: number[]) => Uint8Array.from(values);

describe('BridgeStream', () => {
  it('delivers writes in order even when an earlier one is slower', async () => {
    const { stream, written } = router([30, 0, 0]);
    await Promise.all([stream.write(bytes(1)), stream.write(bytes(2)), stream.write(bytes(3))]);
    expect(written).toEqual([toBase64(bytes(1)), toBase64(bytes(2)), toBase64(bytes(3))]);
  });

  it('hands encoded listeners the base64 untouched and decodes only for byte listeners', () => {
    const { stream, emit } = router();
    const encoded: string[] = [];
    stream.onEncodedData((text) => encoded.push(text));
    const received: number[][] = [];
    emit(toBase64(bytes(1, 2, 3)));
    expect(encoded).toEqual([toBase64(bytes(1, 2, 3))]);
    stream.onData((data) => received.push(Array.from(data)));
    emit(toBase64(bytes(4, 5)));
    expect(received).toEqual([[4, 5]]);
    expect(encoded).toHaveLength(2);
  });
});
