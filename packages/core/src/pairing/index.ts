// endpoint.ts and fingerprint.ts stay internal: P1.3-core-hosts exports its own
// HerdrEndpoint, session-name, quotable-path and fingerprint helpers, and two
// barrels exporting the same names break `tsc -b` (TS2308). Once hosts lands,
// pairing imports hosts' copies and these two files go away.

export { decodeBase64Url, encodeBase64Url } from './bytes';
export {
  type EnrollmentRefusal,
  type EnrollmentResponse,
  enrollmentRefusal,
  failureStep,
  isTailscaleSSH,
  PAIRING_STEPS,
  PairingCancelledError,
  PairingCeremonyError,
  type PairingCeremonyFailure,
  type PairingResult,
  type PairingStep,
  parseEnrollmentResponse,
} from './ceremony';
export {
  decodePairingCode,
  needsConfirmation,
  PAIRING_CODE_PREFIX,
  type PairingBootstrap,
  type PairingCode,
  type PairingCodeDecoding,
  type PairingCodeError,
  withoutBootstrap,
} from './code';
export {
  type PairingCancellation,
  type PairingConnector,
  type PairingDeviceKey,
  type PairingDial,
  type PairingIdentity,
  type PairingSSHConnection,
  PairingSSHError,
  type PairingSSHFailureKind,
  type SSHPairingConnectorOptions,
} from './connector';
export {
  ceremonyFailure,
  PAIRING_MESSAGE_CATALOG_KEYS,
  type PairingFailure,
  type PairingMessage,
  type PairingMessageId,
  scanFailureMessage,
} from './failure';
export { FakePairingConnector, type FakePairingOutcome } from './fake-connector';
export {
  findPairedTwin,
  mayBePairedTwin,
  missingRoutes,
  type NewPairedHost,
  type PairingCatalogHost,
  type PairingHostCatalog,
  pairedAddresses,
} from './host-catalog';
export { MemoryPairingCatalog } from './memory-catalog';
export {
  type PairingDeviceKeyLoad,
  type PairingScanState,
  PairingScanStore,
  type PairingScanStoreOptions,
} from './scan-store';
export { createSSHPairingConnector } from './ssh-connector';
