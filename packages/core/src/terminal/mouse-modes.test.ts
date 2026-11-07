import { describe, expect, it } from 'vitest';
import { utf8Decode, utf8Encode } from '../pairing/bytes';
import { TerminalMouseModes } from './mouse-modes';

const received = (...chunks: string[]) => {
  const modes = new TerminalMouseModes();
  for (const chunk of chunks) modes.receive(utf8Encode(chunk));
  return modes;
};

describe('TerminalMouseModes', () => {
  it('asks nothing of a remote that never turned mouse tracking on', () => {
    const modes = received('hello \u001b[?25l \u001b[2J');
    expect(modes.tracksMouse).toBe(false);
    expect(modes.wheelReport('older', 80, 24)).toBeNull();
  });

  it('aims an SGR wheel report at the centre of the grid', () => {
    const modes = received('\u001b[?1000h\u001b[?1006h');
    expect(utf8Decode(modes.wheelReport('older', 80, 24) as Uint8Array, true)).toBe(
      '\u001b[<64;40;12M',
    );
    expect(utf8Decode(modes.wheelReport('newer', 80, 24) as Uint8Array, true)).toBe(
      '\u001b[<65;40;12M',
    );
  });

  it('falls back to a legacy report without SGR', () => {
    const report = received('\u001b[?1002h').wheelReport('older', 80, 24) as Uint8Array;
    expect([...report]).toEqual([0x1b, 0x5b, 0x4d, 64 + 32, 40 + 32, 12 + 32]);
  });

  it('follows a mode list, and a mode turned back off', () => {
    const modes = received('\u001b[?1000;1003;1006h', '\u001b[?1000l');
    expect(modes.tracksMouse).toBe(true);
    modes.receive(utf8Encode('\u001b[?1003l'));
    expect(modes.tracksMouse).toBe(false);
  });

  it('reads a sequence split across chunks', () => {
    expect(received('x\u001b', '[', '?10', '00', 'h').tracksMouse).toBe(true);
  });

  it('survives an escape interrupting a sequence, and overlong noise', () => {
    expect(received('\u001b[?10\u001b[?1000h').tracksMouse).toBe(true);
    expect(received(`\u001b[?${'1'.repeat(500)}h`).tracksMouse).toBe(false);
  });

  it('forgets everything on reset', () => {
    const modes = received('\u001b[?1000h\u001b[?1006h\u001b[?10');
    modes.reset();
    expect(modes.tracksMouse).toBe(false);
    modes.receive(utf8Encode('00h'));
    expect(modes.tracksMouse).toBe(false);
  });
});
