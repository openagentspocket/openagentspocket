import { describe, expect, it } from 'vitest';
import { bytesEqual, concatBytes } from '../chat/model/host-files';
import { asciiBytes } from './bytes';
import { AttachExitDiagnostic, lineFromOutput } from './exit-diagnostic';
import { ATTACH_MARKER, AttachBootstrapGate, MAXIMUM_WITHHELD_BYTES } from './handshake';
import { HerdrStartupProbeFilter, PROBE_SCAN_WINDOW } from './probe-filter';

const text = (bytes: Uint8Array) => String.fromCharCode(...bytes);
const DA1 = '\x1b[?1016$p\x1b[c';
const CLIENT = '\x1b[?1016$p\x1b[?u\x1b[c';

describe('AttachBootstrapGate', () => {
  it('withholds startup chatter until the handshake, then passes the session', () => {
    const gate = new AttachBootstrapGate();
    expect(gate.admit(asciiBytes('motd\r\n'))).toHaveLength(0);
    const out = gate.admit(concatBytes([ATTACH_MARKER, asciiBytes('hello')]));
    expect(text(out)).toBe('hello');
    expect(text(gate.admit(asciiBytes(' more')))).toBe(' more');
    expect(gate.flush()).toHaveLength(0);
  });

  it('matches a handshake split across chunks', () => {
    const gate = new AttachBootstrapGate();
    const cut = 7;
    expect(gate.admit(ATTACH_MARKER.slice(0, cut))).toHaveLength(0);
    expect(text(gate.admit(concatBytes([ATTACH_MARKER.slice(cut), asciiBytes('x')])))).toBe('x');
  });

  it('hands back the startup diagnostic when the handshake never came', () => {
    const gate = new AttachBootstrapGate();
    gate.admit(asciiBytes('sh: herdr: not found'));
    expect(text(gate.flush())).toBe('sh: herdr: not found');
    expect(gate.flush()).toHaveLength(0);
  });

  it('bounds the withheld noise without losing a later handshake', () => {
    const gate = new AttachBootstrapGate();
    gate.admit(new Uint8Array(MAXIMUM_WITHHELD_BYTES * 3).fill(65));
    expect(gate.flush().length).toBe(MAXIMUM_WITHHELD_BYTES);
    gate.admit(new Uint8Array(MAXIMUM_WITHHELD_BYTES * 3).fill(65));
    expect(text(gate.admit(concatBytes([ATTACH_MARKER, asciiBytes('ok')])))).toBe('ok');
  });

  it('is not opened by chatter that contains the escaped text', () => {
    const gate = new AttachBootstrapGate();
    gate.admit(asciiBytes('\\033_agentico-attach\\033\\134'));
    expect(gate.isOpen).toBe(false);
  });
});

describe('HerdrStartupProbeFilter', () => {
  const run = (filter: HerdrStartupProbeFilter, ...chunks: string[]) =>
    chunks.map((chunk) => text(filter.filter(asciiBytes(chunk)))).join('') + text(filter.finish());

  it('drops direct attach probe and keeps everything around it', () => {
    expect(run(new HerdrStartupProbeFilter(true), `a${DA1}b`)).toBe('ab');
  });

  it('drops the client shell probe with the kitty query', () => {
    expect(run(new HerdrStartupProbeFilter(true), `x${CLIENT}y`)).toBe('xy');
  });

  it('drops a probe split across reads at any cut', () => {
    for (let cut = 1; cut < DA1.length; cut += 1) {
      const filter = new HerdrStartupProbeFilter(true);
      expect(run(filter, `a${DA1.slice(0, cut)}`, `${DA1.slice(cut)}z`)).toBe('az');
    }
  });

  it('passes output without a probe unchanged', () => {
    expect(run(new HerdrStartupProbeFilter(true), 'plain', ' output')).toBe('plain output');
  });

  it('keeps other queries ahead of the probe', () => {
    expect(run(new HerdrStartupProbeFilter(true), `\x1b[?2004h\x1b[>1u${DA1}!`)).toBe(
      '\x1b[?2004h\x1b[>1u!',
    );
  });

  it('keeps a probe that starts past the first 4 KiB', () => {
    const lead = 'a'.repeat(PROBE_SCAN_WINDOW);
    expect(run(new HerdrStartupProbeFilter(true), lead, DA1)).toBe(lead + DA1);
  });

  it('drops a probe starting on the last byte of the window', () => {
    const lead = 'a'.repeat(PROBE_SCAN_WINDOW - 1);
    expect(run(new HerdrStartupProbeFilter(true), `${lead}${DA1}`)).toBe(lead);
  });

  it('hands on a partial probe still held when the output ends', () => {
    const filter = new HerdrStartupProbeFilter(true);
    expect(text(filter.filter(asciiBytes('a\x1b[?10')))).toBe('a');
    expect(text(filter.finish())).toBe('\x1b[?10');
  });

  it('is a pass-through when disabled', () => {
    const bytes = asciiBytes(DA1);
    expect(bytesEqual(new HerdrStartupProbeFilter(false).filter(bytes), bytes)).toBe(true);
  });
});

describe('AttachExitDiagnostic', () => {
  const quote = (...chunks: string[]) => {
    const diagnostic = new AttachExitDiagnostic();
    for (const chunk of chunks) diagnostic.record(asciiBytes(chunk));
    return diagnostic.line;
  };

  it('quotes the last line printed after leaving the alternate screen', () => {
    expect(quote('\x1b[?1049hTUI SECRET\x1b[?1049l', 'herdr: lost connection to server\r\n')).toBe(
      'herdr: lost connection to server',
    );
  });

  it('prefers clap error lines over the help hint', () => {
    expect(
      quote(
        'error: unexpected argument\n\nUsage: herdr agent attach\n\nFor more information, try --help\n',
      ),
    ).toBe('error: unexpected argument');
  });

  it('skips a rust backtrace note', () => {
    expect(quote('thread main panicked\nnote: run with RUST_BACKTRACE=1\n')).toBe(
      'thread main panicked',
    );
  });

  it('quotes nothing from inside the alternate screen', () => {
    expect(quote('\x1b[?1049hsecret screen')).toBeNull();
  });

  it('follows a mode switch split across chunks', () => {
    expect(quote('before\x1b[?10', '49hsecret')).toBeNull();
  });

  it('quotes the last line when the screen was never entered', () => {
    expect(quote('one\ntwo\n')).toBe('two');
  });

  it('strips escapes, controls and bidi formatting', () => {
    expect(lineFromOutput('\x1b[31merror:\x1b[0m bad‮ thing\x07\n')).toBe('error: bad thing');
  });

  it('truncates a long line with an ellipsis', () => {
    const line = lineFromOutput('x'.repeat(300));
    expect([...(line ?? '')].length).toBe(120);
    expect(line?.endsWith('…')).toBe(true);
  });

  it('keeps only the tail of a long stream and never quotes the cut fragment', () => {
    const diagnostic = new AttachExitDiagnostic();
    diagnostic.record(asciiBytes(`${'a'.repeat(20_000)}\nlast words\n`));
    expect(diagnostic.line).toBe('last words');
    const cut = new AttachExitDiagnostic();
    cut.record(asciiBytes(`${'b'.repeat(20_000)}\nok`));
    expect(cut.line).toBe('ok');
  });

  it('has no line for whitespace-only output', () => {
    expect(quote('  \r\n \n')).toBeNull();
  });
});
