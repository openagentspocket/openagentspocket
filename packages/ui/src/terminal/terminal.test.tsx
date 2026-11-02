import { act, screen } from '@testing-library/react-native';
import { createRef } from 'react';
import { renderThemed } from '../test-utils';
import { TerminalView } from './TerminalView';
import type { TerminalHandle } from './terminalTypes';
import { decodeUtf8Stream } from './utf8';
import { createWriteBatcher } from './writeBatcher';

const bytes = (text: string) =>
  Uint8Array.from(unescape(encodeURIComponent(text)), (c) => c.charCodeAt(0));

describe('decodeUtf8Stream', () => {
  it('joins a character split across two chunks', () => {
    const decode = decodeUtf8Stream();
    const euro = bytes('€');
    expect(decode(euro.subarray(0, 1))).toBe('');
    expect(decode(euro.subarray(1, 2))).toBe('');
    expect(decode(euro.subarray(2))).toBe('€');
  });

  it('decodes four-byte characters and plain text unchanged', () => {
    const decode = decodeUtf8Stream();
    expect(decode(bytes('ok 🙂 日本'))).toBe('ok 🙂 日本');
  });

  it('replaces malformed bytes instead of throwing', () => {
    expect(decodeUtf8Stream()(Uint8Array.from([0x61, 0xff, 0x62]))).toBe('a�b');
  });
});

describe('createWriteBatcher', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('sends many small chunks as one write after the interval', () => {
    const sent: Uint8Array[] = [];
    const batcher = createWriteBatcher((chunk) => sent.push(chunk), { intervalMs: 8 });
    for (let i = 0; i < 50; i++) batcher.push(Uint8Array.from([i]));
    expect(sent).toHaveLength(0);
    jest.advanceTimersByTime(8);
    expect(sent).toHaveLength(1);
    expect(Array.from(sent[0] ?? [])).toEqual(Array.from({ length: 50 }, (_, i) => i));
  });

  it('sends at once past the size bound and keeps order', () => {
    const sent: number[] = [];
    const batcher = createWriteBatcher((chunk) => sent.push(chunk.length), { maxBytes: 10 });
    batcher.push(new Uint8Array(6));
    batcher.push(new Uint8Array(6));
    batcher.push(new Uint8Array(3));
    expect(sent).toEqual([12]);
    batcher.flush();
    expect(sent).toEqual([12, 3]);
  });

  it('drops queued output on dispose', () => {
    const sent: Uint8Array[] = [];
    const batcher = createWriteBatcher((chunk) => sent.push(chunk));
    batcher.push(new Uint8Array(4));
    batcher.dispose();
    jest.advanceTimersByTime(100);
    expect(sent).toHaveLength(0);
  });
});

describe('TerminalView fallback', () => {
  it('shows bytes fed through the handle, even when a character is split', async () => {
    const ref = createRef<TerminalHandle>();
    await renderThemed(<TerminalView ref={ref} renderer="plain" />);
    const euro = bytes('€');
    await act(async () => {
      ref.current?.writeBytes(bytes('a'));
      ref.current?.writeBytes(euro.subarray(0, 2));
      ref.current?.writeBytes(euro.subarray(2));
    });
    expect(screen.getByTestId('terminal-screen').props.children).toBe('a€');
  });

  it('falls back to the plain renderer when the native module is absent', async () => {
    await renderThemed(<TerminalView />);
    expect(screen.getByTestId('terminal-input')).toBeTruthy();
  });
});
