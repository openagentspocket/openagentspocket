/**
 * The transport failures the events layer reads or synthesizes, named after
 * the Swift `TransportError` cases. The full taxonomy (and its isRetryable
 * table) belongs to `packages/core/src/errors`; any `{ kind }`-tagged value
 * from it is a `TransportFailure`, and its classifier plugs in through
 * `FailureModel`.
 */
export interface TransportFailure {
  readonly kind: string;
}

export const failures = {
  sshUnreachable: (detail: string) => ({ kind: 'sshUnreachable', detail }) as const,
  timedOut: () => ({ kind: 'timedOut' }) as const,
  cancelled: () => ({ kind: 'cancelled' }) as const,
  channelFailed: (detail: string) => ({ kind: 'channelFailed', detail }) as const,
  apiRejected: (code: string, message: string) => ({ kind: 'apiRejected', code, message }) as const,
  malformedResponse: (detail: string) => ({ kind: 'malformedResponse', detail }) as const,
  protocolVersionMismatch: (server: number, supported: number) =>
    ({ kind: 'protocolVersionMismatch', server, supported }) as const,
  eventsChannelAlreadyOpen: () => ({ kind: 'eventsChannelAlreadyOpen' }) as const,
};

/** An `Error` carrying a failure, so rejections keep stack traces. */
export class TransportFailureError extends Error {
  constructor(readonly failure: TransportFailure) {
    super(`transport failure: ${failure.kind}`);
    this.name = 'TransportFailureError';
  }
}

export const failWith = (failure: TransportFailure): TransportFailureError =>
  new TransportFailureError(failure);

export interface FailureModel {
  /** Maps whatever a Transport, `connect`, or a channel threw onto the taxonomy. */
  from(error: unknown): TransportFailure;
  /** Whether reconnecting without the user can plausibly recover. */
  isRetryable(failure: TransportFailure): boolean;
}

const isFailure = (value: unknown): value is TransportFailure =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { kind?: unknown }).kind === 'string';

/** Retryable kinds of the Swift table; every other kind needs the user. */
const RETRYABLE = new Set([
  'sshUnreachable',
  'timedOut',
  'cancelled',
  'channelFailed',
  'attachExited',
  'apiRejected',
]);

/**
 * The default classifier. Wrapped (`jumpHostFailed`, `noRouteReached`,
 * `overlayFailed`) kinds are not modeled here: they are classified as
 * non-retryable until the full errors model is injected.
 */
export const basicFailureModel: FailureModel = {
  from(error) {
    if (error instanceof TransportFailureError) return error.failure;
    if (isFailure(error)) return error;
    const detail = error instanceof Error ? error.message : String(error);
    return failures.channelFailed(detail);
  },
  isRetryable: (failure) => RETRYABLE.has(failure.kind),
};

/** Link-level failures worth one redial-and-retry: the SSH link itself broke. */
export const isLinkFailure = (failure: TransportFailure): boolean =>
  failure.kind === 'sshUnreachable' || failure.kind === 'timedOut';

/** herdr rejected a subscribe because one pane entry names an exited pane. */
export const namesMissingPane = (failure: TransportFailure): boolean =>
  failure.kind === 'apiRejected' && (failure as { code?: unknown }).code === 'pane_not_found';
