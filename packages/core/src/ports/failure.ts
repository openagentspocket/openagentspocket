import { presentation, presentationMessage } from '../errors/presentation';
import { message, renderText, sourceText, type Text, type Translate } from '../errors/text';
import type { TransportError } from '../errors/transport-error';

/** Text a person reads: a catalog entry, plain words, or a transport failure's own presentation. */
export type PortsMessage = Text | { readonly transport: TransportError };

export function renderPortsMessage(value: PortsMessage, translate: Translate = sourceText): string {
  if (typeof value === 'object' && 'transport' in value) {
    return presentationMessage(presentation(value.transport), translate);
  }
  return renderText(value, translate);
}

/** Why a preview shows no page, in the words the Preview screen uses. */
export interface PortPreviewFailure {
  readonly title: Text;
  readonly message: PortsMessage;
}

/**
 * The transport's detail when sshd reached nothing on the port. One text for the transport and
 * the screen, so the screen can name it.
 */
export function nothingAnsweredDetail(port: number): string {
  return renderText(message('Nothing on the Host answered on port %@.', String(port)));
}

/** A tunnel or channel failure on the Host's port `port`. */
export function portPreviewFailure(error: TransportError, port: number): PortPreviewFailure {
  switch (error.kind) {
    case 'channelFailed':
      if (error.detail === nothingAnsweredDetail(port)) {
        return {
          title: message('Nothing Answered'),
          message: message('Nothing on the Host answered on port %@.', String(port)),
        };
      }
      break;
    case 'tcpForwardingUnavailable':
      // The shared presentation names the Jump Host; here it is the Host's own sshd that refuses.
      return {
        title: message('Port Forwarding Is Off'),
        message: message(
          "This Host's SSH server refuses port forwarding. Set AllowTcpForwarding to yes or local in its sshd_config, then try again.",
        ),
      };
    case 'hostFeatureUnavailable':
      return {
        title: message('Not Available on This Host'),
        message: message('Browser preview needs a Linux or macOS Host.'),
      };
    default:
      break;
  }
  return { title: message("Couldn't Open the Preview"), message: { transport: error } };
}

/** The page itself failed and the tunnel recorded nothing: the web view's own words. */
export function pageFailure(description: string): PortPreviewFailure {
  return { title: message("Couldn't Load the Page"), message: description };
}

/** Why a discovery failed, in the user's words. */
export function discoveryMessage(error: TransportError): PortsMessage {
  if (error.kind === 'hostFeatureUnavailable') {
    return message('Ports are not available on native Windows Hosts.');
  }
  return { transport: error };
}
