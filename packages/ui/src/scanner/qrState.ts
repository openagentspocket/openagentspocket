/** What the camera area shows, from the system permission and whether the camera started. */
export type QRScannerState = 'checking' | 'ready' | 'ask' | 'denied' | 'unavailable';

export interface QRPermission {
  granted: boolean;
  /** False once the system will not show its prompt again: only Settings can change the answer. */
  canAskAgain: boolean;
}

/** `permission` is null while the system is still answering. */
export function scannerState(
  permission: QRPermission | null,
  mountFailed: boolean,
): QRScannerState {
  if (mountFailed) return 'unavailable';
  if (permission === null) return 'checking';
  if (permission.granted) return 'ready';
  return permission.canAskAgain ? 'ask' : 'denied';
}

/** How long the same code is ignored after it was delivered; the camera reports it every frame. */
export const SAME_CODE_MS = 2000;

/** Delivers each scanned code once per burst: a repeat inside the window is dropped. */
export function createCodeGate(
  now: () => number = Date.now,
  windowMs: number = SAME_CODE_MS,
): (text: string) => boolean {
  let last: { text: string; at: number } | null = null;
  return (text) => {
    const at = now();
    if (last && last.text === text && at - last.at < windowMs) return false;
    last = { text, at };
    return true;
  };
}
