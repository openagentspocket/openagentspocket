import { type ByteString, decodeBytes } from './bytes';
import { marker } from './script';
import { ChangesReadError } from './types';

/** One framed command's output. */
export interface Section {
  /** Standard output between the markers, cut to the section's cap. */
  readonly body: ByteString;
  /** The command's framed exit status. */
  readonly status: number;
  /** The command printed more than its cap. Length is the only reliable signal. */
  readonly isTruncated: boolean;
  /** Standard error between the section's framed begin and end lines. */
  readonly messages: ByteString;
}

/** Git's first error line, or null when it printed none. */
export function firstMessageLine(section: Section): string | null {
  for (const line of decodeBytes(section.messages).split(/\r\n|[\n\r]/)) {
    const trimmed = line.trim();
    if (trimmed !== '') return trimmed;
  }
  return null;
}

/**
 * A script's output as seen through one request's nonce. Anything outside that nonce's markers
 * (login-shell noise, another request's output) is ignored.
 */
export class Frames {
  private readonly marker: string;

  constructor(
    readonly stdout: ByteString,
    readonly stderr: ByteString,
    nonce: string,
  ) {
    this.marker = marker(nonce);
  }

  /**
   * The final marker arrived. A remote process killed by a signal reads as exit status 0 on the
   * channel, so this, not the channel's status, says the script ran to the end.
   */
  get reachedEnd(): boolean {
    return this.stdout.includes(`\n${this.marker} done\n`);
  }

  /**
   * Null when the section never began. Throws `incomplete` when it began but its framed exit
   * status is missing or unreadable.
   */
  section(name: string, cap: number): Section | null {
    const beginMarker = `\n${this.marker} ${name} begin\n`;
    const begin = this.stdout.indexOf(beginMarker);
    if (begin < 0) return null;
    const bodyStart = begin + beginMarker.length;
    const statusMarker = `\n${this.marker} ${name} rc=`;
    const end = this.stdout.indexOf(statusMarker, bodyStart);
    const statusStart = end + statusMarker.length;
    const lineEnd = end < 0 ? -1 : this.stdout.indexOf('\n', statusStart);
    const raw = lineEnd < 0 ? '' : this.stdout.slice(statusStart, lineEnd);
    if (end < 0 || lineEnd < 0 || !/^\d+$/.test(raw)) {
      throw new ChangesReadError({ kind: 'incomplete' });
    }
    const output = this.stdout.slice(bodyStart, end);
    return {
      body: output.slice(0, cap),
      status: Number(raw),
      isTruncated: output.length > cap,
      messages: this.messages(name),
    };
  }

  private messages(name: string): ByteString {
    const beginMarker = `\n${this.marker} ${name} begin\n`;
    const begin = this.stderr.indexOf(beginMarker);
    if (begin < 0) return '';
    const start = begin + beginMarker.length;
    const end = this.stderr.indexOf(`\n${this.marker} ${name} end\n`, start);
    return this.stderr.slice(start, end < 0 ? undefined : end);
  }

  /** A section the script always runs at this point. */
  requiredSection(name: string, cap: number): Section {
    const section = this.section(name, cap);
    if (section === null) throw new ChangesReadError({ kind: 'incomplete' });
    return section;
  }
}
