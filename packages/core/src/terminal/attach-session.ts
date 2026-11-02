import type { TransportError } from '../errors/transport-error';
import { TransportFailure } from '../errors/transport-error';
import type { Clock } from '../hosts/cancellation';
import { createCancellation } from '../hosts/cancellation';
import type { HerdrEndpoint } from '../hosts/herdr-endpoint';
import { attachChannelFailure } from './attach-command';
import { AttachExitDiagnostic } from './exit-diagnostic';
import { AttachBootstrapGate } from './handshake';
import { TerminalAttachInputQueue } from './input-queue';
import { AttachOutputGate } from './output-gate';
import { HerdrStartupProbeFilter } from './probe-filter';
import type { AttachChannel, TerminalAttachSession } from './types';

export interface AttachSessionOptions {
  readonly clock: Clock;
  /** On for a Unix PTY attach, whose herdr direct attach writes the startup probe. */
  readonly dropsStartupProbe: boolean;
  /** The exec'd attach command, to tell a missing `herdr` from any other exit. */
  readonly attachCommand: string;
  readonly endpoint?: HerdrEndpoint | null;
  /**
   * The Transport's classification of a channel or write failure; a close reason arrives as the
   * reason string. A `channelFailed` result is replaced by a detail naming the failing side.
   */
  readonly mapError: (error: unknown) => TransportError;
  /** Called once with the raw cause of a failure (the Transport invalidates a dead connection). */
  readonly noteFailure?: (error: unknown) => void;
  /** Runs once after the channel is closed: release the admission lease and the channel claim. */
  readonly onFinished: () => void | Promise<void>;
}

/**
 * Starts the pumps over an open PTY `channel` and returns the session: output is held behind the
 * bootstrap gate, then the startup-probe filter, and recorded for the exit diagnostic; input
 * rides the mixed-reliability queue. The session ends when the remote exits, the channel fails,
 * the input pump fails, or the reader calls `end()`. (Swift `runAttachChannel` / `runAttachPumps`.)
 */
export function startAttachSession(
  channel: AttachChannel,
  options: AttachSessionOptions,
): TerminalAttachSession {
  const output = new AttachOutputGate();
  const input = new TerminalAttachInputQueue();
  const cancellation = createCancellation();
  const gate = new AttachBootstrapGate();
  const probe = new HerdrStartupProbeFilter(options.dropsStartupProbe);
  const diagnostic = new AttachExitDiagnostic();
  let settled: Promise<void> | null = null;

  const admit = (bytes: Uint8Array) => {
    if (bytes.length === 0) return;
    diagnostic.record(bytes);
    output.yield(bytes);
  };
  const releaseWithheld = () => {
    admit(gate.flush());
    admit(probe.finish());
  };

  const classify = (error: unknown, side: 'attach input' | 'attach channel'): TransportError => {
    options.noteFailure?.(error);
    if (error instanceof TransportFailure) return error.error;
    const mapped = options.mapError(error);
    return mapped.kind === 'channelFailed'
      ? { kind: 'channelFailed', detail: `${side} failed` }
      : mapped;
  };

  const settle = (failure: TransportError | null, flush: boolean): Promise<void> => {
    if (settled) return settled;
    settled = (async () => {
      if (flush) releaseWithheld();
      input.finish();
      cancellation.cancel();
      try {
        await channel.close();
      } catch (error) {
        // A failed close after a clean end or an explicit end says nothing the reader needs.
        const cleanup = classify(error, 'attach channel');
        if (!failure && flush) failure = cleanup;
      }
      try {
        await options.onFinished();
      } finally {
        output.finish(failure ?? undefined);
      }
    })();
    return settled;
  };

  channel.onData((bytes) => {
    if (settled) return;
    admit(probe.filter(gate.admit(bytes)));
  });
  channel.onClose((reason) => {
    if (settled) return;
    if (reason !== undefined) {
      void settle(classify(reason, 'attach channel'), true);
      return;
    }
    // An orderly end: drain what the channel accepted, then judge the exit status.
    releaseWithheld();
    const status = channel.exitStatus;
    if (status !== undefined && status !== 0) {
      void settle(
        attachChannelFailure({
          exitStatus: status,
          output: diagnostic.line,
          attachCommand: options.attachCommand,
          endpoint: options.endpoint,
        }),
        false,
      );
    } else {
      void settle(null, false);
    }
  });

  void input
    .pump(
      options.clock,
      (data) => channel.write(data),
      (cols, rows) => channel.resize(cols, rows),
      cancellation.signal,
    )
    .catch((error: unknown) => {
      if (settled) return;
      void settle(classify(error, 'attach input'), true);
    });

  return {
    get output() {
      return output.makeOutput();
    },
    send: (keystrokes) => input.send(keystrokes),
    scroll: (sequence, rows) => input.scroll(sequence, rows),
    resize: (cols, rows) => input.resize(cols, rows),
    async end() {
      output.beginExplicitEnd();
      await settle(null, false);
    },
  };
}
