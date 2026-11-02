import { concatBytes } from '../chat/model/host-files';
import { asciiBytes, indexOfBytes } from './bytes';

/**
 * The handshake that separates an attach channel's pre-attach noise from the attach session.
 *
 * The attach exec still runs through the account shell, so startup or rc chatter can reach the
 * PTY before herdr starts. The exec prints this marker right before `exec herdr ... attach`
 * and everything up to it is dropped. It is real control bytes, so chatter that merely contains
 * the text `\033` cannot open the gate. APC is the one string terminals must ignore, which keeps
 * a stray copy harmless. (Swift `AttachBootstrapHandshake`.)
 */
export const ATTACH_MARKER = asciiBytes('\x1b_agentico-attach\x1b\\');

/**
 * `ATTACH_MARKER` as a `printf` format. Octal throughout: it must survive the Host's account
 * shell (fish included) and `/bin/sh` before printf sees it.
 */
export const ATTACH_MARKER_PRINTF_FORMAT = '\\033_agentico-attach\\033\\134';

/** A ceiling for a channel that never handshakes; the kept tail still holds a split marker. */
export const MAXIMUM_WITHHELD_BYTES = 8 * 1024;

const EMPTY = new Uint8Array(0);

/**
 * Holds an attach channel's output back until the handshake lands. The withheld bytes are
 * buffered, not dropped: a channel that dies before the handshake has said everything it will
 * ever say in that startup diagnostic, so `flush()` hands it back. (Swift `AttachBootstrapGate`.)
 */
export class AttachBootstrapGate {
  private open = false;
  private withheld: Uint8Array = EMPTY;

  get isOpen(): boolean {
    return this.open;
  }

  /** What the terminal should paint: nothing until the marker arrives, everything after it. */
  admit(bytes: Uint8Array): Uint8Array {
    if (this.open) return bytes;
    this.withheld = concatBytes([this.withheld, bytes]);
    const at = indexOfBytes(this.withheld, ATTACH_MARKER);
    if (at < 0) {
      if (this.withheld.length > MAXIMUM_WITHHELD_BYTES) {
        this.withheld = this.withheld.slice(this.withheld.length - MAXIMUM_WITHHELD_BYTES);
      }
      return EMPTY;
    }
    this.open = true;
    const session = this.withheld.slice(at + ATTACH_MARKER.length);
    this.withheld = EMPTY;
    return session;
  }

  /** The withheld noise, for a channel that ended before it handshook; empty once open. */
  flush(): Uint8Array {
    if (this.open) return EMPTY;
    const noise = this.withheld;
    this.withheld = EMPTY;
    return noise;
  }
}
