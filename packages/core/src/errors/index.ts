export { HerdrApiError } from './herdr-api-error';
export {
  explanation,
  presentation,
  presentationMessage,
  type TransportErrorPresentation,
  userFacingDescription,
} from './presentation';
export {
  type Joined,
  type Message,
  message,
  renderText,
  sourceText,
  type Text,
  type Translate,
} from './text';
export {
  asTransportError,
  isHostKeySecurityFailure,
  isRetryable,
  isRouteHostKeySecurityFailure,
  type RouteFailure,
  type TransportError,
  type TransportErrorKind,
  TransportFailure,
} from './transport-error';
