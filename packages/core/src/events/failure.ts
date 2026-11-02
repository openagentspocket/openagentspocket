import type { TransportError } from '../errors/transport-error';
import { TransportFailure } from '../errors/transport-error';

/**
 * Constructors for the `TransportError` cases the events layer synthesizes. The taxonomy, the
 * retry table and `asTransportError` belong to `../errors`; this only builds values of it.
 */
export const failures = {
  sshUnreachable: (detail: string): TransportError => ({ kind: 'sshUnreachable', detail }),
  timedOut: (): TransportError => ({ kind: 'timedOut' }),
  cancelled: (): TransportError => ({ kind: 'cancelled' }),
  channelFailed: (detail: string): TransportError => ({ kind: 'channelFailed', detail }),
  apiRejected: (code: string, message: string): TransportError => ({
    kind: 'apiRejected',
    code,
    message,
  }),
  malformedResponse: (detail: string): TransportError => ({ kind: 'malformedResponse', detail }),
  protocolVersionMismatch: (server: number, supported: number): TransportError => ({
    kind: 'protocolVersionMismatch',
    server,
    supported,
  }),
  eventsChannelAlreadyOpen: (): TransportError => ({ kind: 'eventsChannelAlreadyOpen' }),
};

/** The thrown carrier of a failure, so rejections keep stack traces. */
export const failWith = (error: TransportError): TransportFailure => new TransportFailure(error);

/** Link-level failures worth one redial-and-retry: the SSH link itself broke. */
export const isLinkFailure = (error: TransportError): boolean =>
  error.kind === 'sshUnreachable' || error.kind === 'timedOut';

/** herdr rejected a subscribe because one pane entry names an exited pane. */
export const namesMissingPane = (error: TransportError): boolean =>
  error.kind === 'apiRejected' && error.code === 'pane_not_found';
