import { concatBytes } from '../chat/model/host-files';
import { asciiBytes, indexOfBytes } from './bytes';

/** The probe shapes herdr writes: direct attach's, and its client shell's (adds the kitty query). */
const PROBES = [asciiBytes('\x1b[?1016$p\x1b[c'), asciiBytes('\x1b[?1016$p\x1b[?u\x1b[c')];

/** How far after the marker a probe may start and still be herdr's. */
export const PROBE_SCAN_WINDOW = 4 * 1024;

const EMPTY = new Uint8Array(0);

function earliestProbe(data: Uint8Array): { start: number; end: number } | null {
  let best: { start: number; end: number } | null = null;
  for (const probe of PROBES) {
    const start = indexOfBytes(data, probe);
    if (start >= 0 && (!best || start < best.start)) best = { start, end: start + probe.length };
  }
  return best;
}

function endsWithPrefix(data: Uint8Array, probe: Uint8Array, length: number): boolean {
  for (let index = 0; index < length; index += 1) {
    if (data[data.length - length + index] !== probe[index]) return false;
  }
  return true;
}

/** The length of the longest suffix of `data` that is a proper prefix of a probe. */
function trailingProbePrefixLength(data: Uint8Array): number {
  let longest = 0;
  for (const probe of PROBES) {
    for (let length = Math.min(probe.length - 1, data.length); length > longest; length -= 1) {
      if (endsWithPrefix(data, probe, length)) {
        longest = length;
        break;
      }
    }
  }
  return longest;
}

/**
 * Drops herdr's direct-attach startup probe from attach output: a DECRQM for SGR pixel mouse,
 * then DA1. herdr waits 250 ms for the answer; one that arrives later reaches the Pane as typed
 * input, so the terminal must never answer. Only the first 4 KiB after the marker are searched
 * and only the first probe found there is removed; every other byte passes unchanged. At most
 * 15 bytes (a probe split across reads) are held until the next read settles them; `finish()`
 * hands them on. (Swift `HerdrStartupProbeFilter`.)
 */
export class HerdrStartupProbeFilter {
  private scanning: boolean;
  private scanned = 0;
  private held: Uint8Array = EMPTY;

  /** A disabled filter passes every byte through, for a channel that never carries the probe. */
  constructor(isEnabled: boolean) {
    this.scanning = isEnabled;
  }

  filter(bytes: Uint8Array): Uint8Array {
    if (!this.scanning) return bytes;
    let data = concatBytes([this.held, bytes]);
    this.held = EMPTY;
    const limit = PROBE_SCAN_WINDOW - this.scanned;
    const probe = earliestProbe(data);
    if (probe) {
      this.scanning = false;
      if (probe.start < limit) {
        data = concatBytes([data.subarray(0, probe.start), data.subarray(probe.end)]);
      }
      return data;
    }
    const heldStart = data.length - trailingProbePrefixLength(data);
    if (heldStart >= limit) {
      this.scanning = false;
      return data;
    }
    this.held = data.slice(heldStart);
    this.scanned += heldStart;
    return data.subarray(0, heldStart);
  }

  /** The partial probe still held when the output ends: output like any other byte. */
  finish(): Uint8Array {
    this.scanning = false;
    const rest = this.held;
    this.held = EMPTY;
    return rest;
  }
}
