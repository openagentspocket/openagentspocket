import { describe, expect, it } from 'vitest';
import { concatBytes } from '../chat/model/host-files';
import { type TransportError, TransportFailure } from '../errors/transport-error';
import { FakeClock } from '../hosts/cancellation';
import { type AttachSessionOptions, startAttachSession } from './attach-session';
import { asciiBytes } from './bytes';
import { ATTACH_MARKER } from './handshake';
import type { AttachChannel } from './types';

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
const text = (bytes: Uint8Array) => String.fromCharCode(...bytes);
const DA1 = '\x1b[?1016$p\x1b[c';

class FakeChannel implements AttachChannel {
  exitStatus: number | undefined;
  closed = false;
  readonly written: Uint8Array[] = [];
  readonly sizes: Array<[number, number]> = [];
  failWrites: Error | null = null;
  private data: Array<(bytes: Uint8Array) => void> = [];
  private close_: Array<(reason?: string) => void> = [];
  async write(bytes: Uint8Array) {
    if (this.failWrites) throw this.failWrites;
    this.written.push(bytes);
  }
  async resize(cols: number, rows: number) {
    this.sizes.push([cols, rows]);
  }
  onData(listener: (bytes: Uint8Array) => void) {
    this.data.push(listener);
    return () => {};
  }
  onClose(listener: (reason?: string) => void) {
    this.close_.push(listener);
    return () => {};
  }
  async close() {
    this.closed = true;
  }
  emit(bytes: Uint8Array | string) {
    const chunk = typeof bytes === 'string' ? asciiBytes(bytes) : bytes;
    for (const listener of this.data) listener(chunk);
  }
  end(reason?: string) {
    for (const listener of this.close_) listener(reason);
  }
}

function setup(options: Partial<AttachSessionOptions> = {}) {
  const channel = new FakeChannel();
  let finished = 0;
  const session = startAttachSession(channel, {
    clock: new FakeClock(settle),
    dropsStartupProbe: true,
    attachCommand: 'herdr agent attach',
    mapError: (error) => ({ kind: 'channelFailed', detail: String(error) }),
    onFinished: () => {
      finished += 1;
    },
    ...options,
  });
  const collected: string[] = [];
  const reader = (async () => {
    for await (const bytes of session.output) collected.push(text(bytes));
  })();
  return { channel, session, collected, reader, finishedCount: () => finished };
}

const failureOf = async (promise: Promise<void>): Promise<TransportError | null> => {
  try {
    await promise;
    return null;
  } catch (error) {
    return error instanceof TransportFailure
      ? error.error
      : { kind: 'channelFailed', detail: String(error) };
  }
};

describe('startAttachSession', () => {
  it('withholds startup chatter, filters the probe, and finishes cleanly on exit 0', async () => {
    const { channel, collected, reader, finishedCount } = setup();
    channel.emit('Last login: today\r\n');
    channel.emit(concatBytes([ATTACH_MARKER, asciiBytes(`ab${DA1}cd`)]));
    channel.exitStatus = 0;
    channel.end();
    expect(await failureOf(reader)).toBeNull();
    expect(collected.join('')).toBe('abcd');
    expect(channel.closed).toBe(true);
    expect(finishedCount()).toBe(1);
  });

  it('quotes herdr last line on a nonzero exit', async () => {
    const { channel, reader } = setup();
    channel.emit(
      concatBytes([
        ATTACH_MARKER,
        asciiBytes('\x1b[?1049hscreen\x1b[?1049lherdr: lost connection to server\r\n'),
      ]),
    );
    channel.exitStatus = 1;
    channel.end();
    expect(await failureOf(reader)).toEqual({
      kind: 'attachExited',
      status: 1,
      output: 'herdr: lost connection to server',
    });
  });

  it('quotes a startup failure that happened before the handshake', async () => {
    const { channel, reader } = setup();
    channel.emit('sh: line 1: herdr: command not found\r\n');
    channel.exitStatus = 127;
    channel.end();
    expect(await failureOf(reader)).toEqual({ kind: 'herdrBinaryNotFound' });
  });

  it('hands back a partial probe still held when the stream ends', async () => {
    const { channel, collected, reader } = setup();
    channel.emit(concatBytes([ATTACH_MARKER, asciiBytes('x\x1b[?10')]));
    channel.exitStatus = 0;
    channel.end();
    await reader;
    expect(collected.join('')).toBe('x\x1b[?10');
  });

  it('maps a channel failure through the transport mapping and names the side', async () => {
    const { channel, reader } = setup();
    channel.end('closed');
    expect(await failureOf(reader)).toEqual({
      kind: 'channelFailed',
      detail: 'attach channel failed',
    });
  });

  it('flushes the withheld diagnostic exactly once when input fails', async () => {
    const { channel, session, collected, reader } = setup();
    channel.emit('startup diagnostic');
    channel.failWrites = new Error('boom');
    session.send(asciiBytes('k'));
    expect(await failureOf(reader)).toEqual({
      kind: 'channelFailed',
      detail: 'attach input failed',
    });
    expect(collected.join('')).toBe('startup diagnostic');
  });

  it('forwards keystrokes and resizes to the channel', async () => {
    const { channel, session } = setup();
    session.send(asciiBytes('ls\r'));
    session.resize(120, 40);
    await settle();
    expect(channel.written.map(text)).toEqual(['ls\r']);
    expect(channel.sizes).toEqual([[120, 40]]);
    await session.end();
  });

  it('an explicit end discards withheld and later output, closes once, and is idempotent', async () => {
    const { channel, session, collected, reader, finishedCount } = setup();
    channel.emit('chatter');
    await session.end();
    channel.emit(concatBytes([ATTACH_MARKER, asciiBytes('late')]));
    await session.end();
    expect(await failureOf(reader)).toBeNull();
    expect(collected).toEqual([]);
    expect(channel.closed).toBe(true);
    expect(finishedCount()).toBe(1);
  });

  it('refuses a second reader and leaves the first running', async () => {
    const { channel, session, collected } = setup();
    channel.emit(concatBytes([ATTACH_MARKER, asciiBytes('one')]));
    await settle();
    const second = (async () => {
      for await (const _ of session.output) return;
    })();
    expect(await failureOf(second)).toEqual({ kind: 'terminalChannelAlreadyOpen' });
    channel.emit('two');
    await settle();
    expect(collected.join('')).toBe('onetwo');
    await session.end();
  });
});
