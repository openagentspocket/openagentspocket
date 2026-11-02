import { utf8Encode } from '../pairing/bytes';
import { webLinkHost } from './link-policy';
import { AttachLinkScanner } from './link-scanner';

/** One exact http(s) target observed during the current Attach. */
export interface AttachLink {
  readonly target: string;
  readonly host: string;
}

export const MAXIMUM_ATTACH_LINKS = 20;

/**
 * The bounded, memory-only collection of links seen in terminal output, newest first
 * (Swift `AttachLinkIndex`). A terminal pipeline may be replaced without replacing this index;
 * the owner clears it on leave. Stream discovery is exact; viewport text supplements it with
 * provisional candidates: every snapshot is independent (its newlines stay hard boundaries) and
 * only the longest member of an ambiguous prefix family is kept unless the stream saw the shorter.
 */
export class AttachLinkIndex {
  private all: AttachLink[] = [];
  private scanner = new AttachLinkScanner();
  private streamObserved = new Set<string>();
  private viewportOnly = new Set<string>();

  get links(): readonly AttachLink[] {
    return this.all;
  }

  receive(data: Uint8Array): void {
    this.scanner.receive(data, (target) => this.recordStream(target));
  }

  receiveViewportText(text: string): void {
    const scanner = new AttachLinkScanner();
    const record = (target: string) => this.recordViewport(target);
    scanner.receive(utf8Encode(text), record);
    scanner.finishOutput(record);
  }

  finishOutput(): void {
    this.scanner.finishOutput((target) => this.recordStream(target));
  }

  clear(): void {
    this.scanner = new AttachLinkScanner();
    this.streamObserved.clear();
    this.viewportOnly.clear();
    this.all = [];
  }

  private recordStream(target: string): void {
    if (webLinkHost(target) === null) return;
    this.removeViewportOnlyPrefixes(target);
    this.record(target, true);
    this.streamObserved.add(target);
    this.viewportOnly.delete(target);
  }

  private recordViewport(target: string): void {
    if (webLinkHost(target) === null) return;
    if (this.all.some((l) => l.target !== target && l.target.startsWith(target))) return;
    this.removeViewportOnlyPrefixes(target);
    this.record(target, false);
    if (!this.streamObserved.has(target)) this.viewportOnly.add(target);
  }

  private removeViewportOnlyPrefixes(target: string): void {
    const prefixes = [...this.viewportOnly].filter((p) => p !== target && target.startsWith(p));
    if (prefixes.length === 0) return;
    this.all = this.all.filter((l) => !prefixes.includes(l.target));
    for (const prefix of prefixes) this.viewportOnly.delete(prefix);
  }

  private record(target: string, moveExistingToFront: boolean): void {
    const host = webLinkHost(target);
    if (host === null) return;
    const exists = this.all.some((l) => l.target === target);
    if (!moveExistingToFront && exists) return;
    this.all = [{ target, host }, ...this.all.filter((l) => l.target !== target)].slice(
      0,
      MAXIMUM_ATTACH_LINKS,
    );
    const kept = new Set(this.all.map((l) => l.target));
    this.streamObserved = new Set([...this.streamObserved].filter((t) => kept.has(t)));
    this.viewportOnly = new Set([...this.viewportOnly].filter((t) => kept.has(t)));
  }
}
