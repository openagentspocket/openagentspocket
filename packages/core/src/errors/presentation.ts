import { HerdrApiError } from './herdr-api-error';
import { type Message, message as m, renderText, type Text, type Translate } from './text';
import {
  isRouteHostKeySecurityFailure,
  type TransportError,
  TransportFailure,
} from './transport-error';

/**
 * What one `TransportError` may say: a Summary (short, stable, standalone, no trailing period,
 * safe on an ambient surface while recovery runs), an optional Detail carrying the error's own
 * words (never authored instruction), and a Recovery suggestion only when the error itself
 * supports a safe next step.
 */
export interface TransportErrorPresentation {
  readonly summary: Text;
  readonly detail?: Text;
  readonly recovery?: Message;
}

const ELLIPSIS = '…';

function p(summary: Text, detail?: Text, recovery?: Message): TransportErrorPresentation {
  return {
    summary,
    ...(detail === undefined ? {} : { detail }),
    ...(recovery === undefined ? {} : { recovery }),
  };
}

/** herdr's own sentence may already end in a period; `explanation` supplies the closing one. */
function droppingTrailingPeriods(text: string): string {
  return text.replace(/\.+$/, '');
}

const VERIFY_KEY = m('Verify it before reconnecting.');
const VERIFY_MACHINE = m('Verify the machine before updating trust.');
const ENABLE_ON_JUMP = m('Enable it on the Jump Host.');

export function presentation(
  error: TransportError,
  options: { readonly usesHerdrEndpoint?: boolean } = {},
): TransportErrorPresentation {
  // An endpoint Host's socket comes from its Pairing Code: no session setting brings a missing
  // one back, so recovery targets the configured instance.
  if (options.usesHerdrEndpoint && error.kind === 'socketNotFound') {
    return p(
      m('The herdr socket was not found'),
      error.path,
      m('Start the herdr instance configured for this Host and verify its socket path.'),
    );
  }
  switch (error.kind) {
    case 'hostFeatureUnavailable':
      return p(m('This feature is unavailable on the Host'), error.feature);
    case 'sshUnreachable':
      return p(
        m('SSH unavailable'),
        error.detail,
        m('Check that the Host is awake and reachable, then verify its address and port.'),
      );
    case 'jumpHostFailed':
      return jumpHostPresentation(error.underlying);
    case 'noRouteReached':
      return noRouteReachedPresentation(error.failures);
    case 'tcpForwardingUnavailable':
      return p(m('SSH TCP forwarding is disabled'), undefined, ENABLE_ON_JUMP);
    case 'authenticationFailed':
      return p(
        m('Authentication failed'),
        undefined,
        m("Update this Host's credentials or authorized key."),
      );
    case 'deviceKeyCorrupt':
      return p(
        m('The Device Key is corrupted'),
        undefined,
        m('Replace it and install the new public key on the Host.'),
      );
    case 'rsaKeyCorrupt':
      return p(
        m('The RSA Key is corrupted'),
        undefined,
        m('Replace it and register the new public key on every Host that uses it.'),
      );
    case 'rsaSignatureUnsupported':
      return p(
        m('The Host does not accept RSA-SHA2-512'),
        undefined,
        m('Enable rsa-sha2-512 signatures on the Host, or choose another authentication method.'),
      );
    case 'keyAccessNotConfirmed':
      return p(
        m('The SSH key stayed locked'),
        undefined,
        m("Retry and confirm it's you to connect."),
      );
    case 'hostKeyRejected':
      return p(m('The host key is not trusted'), undefined, VERIFY_KEY);
    case 'hostKeyMismatch':
      return p(m('The host key changed'), undefined, VERIFY_MACHINE);
    case 'socketNotFound':
      return p(m('The herdr socket was not found'), error.path, m("Check this Host's session."));
    case 'herdrBinaryNotFound':
      return p(
        m("herdr is not on this Host's SSH PATH"),
        undefined,
        m("Put herdr's install directory on the account's non-interactive SSH PATH."),
      );
    case 'herdrLauncherNotFound':
      return p(
        m('The herdr launcher could not run'),
        error.path,
        m(
          'Check that this launcher exists, is executable, and can start herdr. Pair the Host again if its path changed.',
        ),
      );
    case 'streamLocalOpenFailed':
      return p(
        m('herdr is not running on this Host'),
        undefined,
        m('If it is running, check SSH stream-local forwarding.'),
      );
    case 'protocolVersionMismatch':
      return p(
        m('Incompatible herdr protocol'),
        m(
          'herdr speaks protocol %@; this app needs at least %@',
          String(error.server),
          String(error.supported),
        ),
        m('Update herdr on the Host.'),
      );
    case 'homeDirectoryUnresolvable':
      return p(m('The remote home directory could not be resolved'), error.detail);
    case 'invalidDirectoryPath':
      return p(
        m('That folder path cannot be opened'),
        error.path,
        m('Pick a folder from the list instead of typing a path.'),
      );
    case 'eventsChannelAlreadyOpen':
    case 'terminalChannelAlreadyOpen':
      return p(
        m('The connection is busy'),
        undefined,
        m('Close the other terminal before reconnecting.'),
      );
    case 'timedOut':
      return p(m('Connection timed out'));
    case 'gitTimedOut':
      return p(m('Reading Changes timed out'));
    case 'hostFileTimedOut':
      return p(m('Reading the conversation timed out'));
    case 'hostFileUnreadable':
      return p(
        m('The conversation file cannot be read'),
        m('SFTP status %@', String(error.status)),
        m("Check the file's permissions on the Host."),
      );
    case 'hostStoreUnreadable':
      // A whole sentence explains itself; a reader's line cut short keeps its ellipsis.
      return error.detail.endsWith(ELLIPSIS)
        ? p(m("OpenCode's database couldn't be read"), error.detail)
        : p(droppingTrailingPeriods(error.detail));
    case 'cancelled':
      return p(m('Connection cancelled'));
    case 'malformedResponse':
      return p(m('herdr returned an invalid response'), error.detail, m('Check its version.'));
    case 'apiRejected':
      return p(m('herdr rejected the request'), `${error.message} (${error.code})`);
    case 'channelFailed':
      return p(m('Connection dropped'), error.detail);
    case 'attachExited': {
      const output = error.output === undefined ? '' : droppingTrailingPeriods(error.output);
      return p(
        m('herdr exited with status %@', String(error.status)),
        output === '' ? undefined : output,
      );
    }
  }
}

/** Jump Host failures name the Jump Host, never tell the user to fix the Host itself. */
function jumpHostPresentation(underlying: TransportError): TransportErrorPresentation {
  switch (underlying.kind) {
    case 'hostFeatureUnavailable':
    case 'jumpHostFailed':
    case 'deviceKeyCorrupt':
    case 'rsaKeyCorrupt':
      return presentation(underlying);
    case 'sshUnreachable':
      return p(
        m('Jump Host unavailable'),
        underlying.detail,
        m('Check that the Jump Host is awake and reachable, then verify its address and port.'),
      );
    case 'authenticationFailed':
      return p(
        m('The Jump Host rejected authentication'),
        undefined,
        m("Update the Jump Host's credentials or authorized key."),
      );
    case 'hostKeyRejected':
      return p(m("The Jump Host's key is not trusted"), undefined, VERIFY_KEY);
    case 'hostKeyMismatch':
      return p(m("The Jump Host's key changed"), undefined, VERIFY_MACHINE);
    case 'tcpForwardingUnavailable':
      return p(m('SSH TCP forwarding is disabled on the Jump Host'), undefined, ENABLE_ON_JUMP);
    case 'timedOut':
      return p(m('The Jump Host did not answer in time'));
    case 'cancelled':
      return p(m('Jump Host connection cancelled'));
    case 'channelFailed':
      return p(m('The Jump Host connection dropped'), underlying.detail);
    case 'rsaSignatureUnsupported':
      return p(
        m('The Jump Host does not accept RSA-SHA2-512'),
        undefined,
        m(
          'Enable rsa-sha2-512 signatures on the Jump Host, or choose another authentication method.',
        ),
      );
    default: {
      // The Host-targeted suggestion would point at the wrong machine, so it is dropped.
      const inner = presentation(underlying);
      return p(m('Jump Host: %@', inner.summary), inner.detail);
    }
  }
}

/**
 * Every route's own failure, in order. A changed key that counts as a security failure leads,
 * as it would for a Host with one route, so it does not read as an ordinary outage.
 */
function noRouteReachedPresentation(
  failures: Extract<TransportError, { kind: 'noRouteReached' }>['failures'],
): TransportErrorPresentation {
  const detail: Text = {
    join: failures.map((failure) => ({
      join: [failure.route, presentation(failure.error).summary],
      separator: ': ',
    })),
    separator: '; ',
  };
  const changed = failures.find(isRouteHostKeySecurityFailure);
  if (changed) {
    const shown = presentation(changed.error);
    return p(shown.summary, detail, shown.recovery);
  }
  return p(
    m('No route reached the Host'),
    detail,
    m('Check that the Host is awake, then review its routes.'),
  );
}

/** Summary [+ ": " + detail] + "." — what happened, no instruction. */
export function explanation(shown: TransportErrorPresentation, translate?: Translate): string {
  const summary = renderText(shown.summary, translate);
  if (shown.detail === undefined) return `${summary}.`;
  const detail = renderText(shown.detail, translate);
  // A detail cut short with an ellipsis already ends the sentence.
  return detail.endsWith(ELLIPSIS) ? `${summary}: ${detail}` : `${summary}: ${detail}.`;
}

/** The whole presentation: explanation [+ " " + recovery]. */
export function presentationMessage(
  shown: TransportErrorPresentation,
  translate?: Translate,
): string {
  const told = explanation(shown, translate);
  return shown.recovery === undefined ? told : `${told} ${renderText(shown.recovery, translate)}`;
}

/**
 * What a person reads for any thrown value: a transport failure through its presentation,
 * herdr's own rejection through its message, anything else through its own description.
 */
export function userFacingDescription(thrown: unknown, translate?: Translate): string {
  if (thrown instanceof TransportFailure) {
    return presentationMessage(presentation(thrown.error), translate);
  }
  if (thrown instanceof HerdrApiError) return thrown.message;
  if (thrown instanceof Error) return thrown.message;
  return String(thrown);
}
