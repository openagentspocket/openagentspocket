import { ScriptedTerminalSession } from '@openagentspocket/core';

const PROMPT = '$ ';
const ENCODER_OUT = (text: string) => Uint8Array.from(text, (char) => char.charCodeAt(0) & 0xff);

/**
 * The offline terminal: a prompt that echoes what is typed, so demo mode and screenshots can
 * show the keys working. Enter starts a new prompt line; Backspace erases one character.
 */
export class DemoTerminalSession extends ScriptedTerminalSession {
  constructor() {
    super();
    this.emit(ENCODER_OUT(`Demo terminal. Nothing leaves this device.\r\n${PROMPT}`));
  }

  override send(keystrokes: Uint8Array): void {
    super.send(keystrokes);
    let echo = '';
    for (const byte of keystrokes) {
      if (byte === 0x0d) echo += `\r\n${PROMPT}`;
      else if (byte === 0x7f) echo += '\b \b';
      else if (byte >= 0x20 && byte < 0x7f) echo += String.fromCharCode(byte);
      else if (byte < 0x20) echo += `^${String.fromCharCode(byte + 0x40)}`;
    }
    if (echo) this.emit(ENCODER_OUT(echo));
  }
}

const HISTORY_LINES = 200;
const WHEEL_UP = 64;

/**
 * The offline Agent: a full-screen TUI like `herdr agent attach`, on the alternate screen and
 * tracking the mouse, whose history only a wheel report reaches. Each repaint says where it stands.
 */
export class DemoAgentTuiSession extends ScriptedTerminalSession {
  private rows = 0;
  private offset = 0;

  override resize(cols: number, rows: number): void {
    super.resize(cols, rows);
    if (this.rows === 0) this.emit(ENCODER_OUT('\u001b[?1049h\u001b[?1000h\u001b[?1006h'));
    this.rows = rows;
    this.paint();
  }

  override scroll(sequence: Uint8Array, rows: number): void {
    super.scroll(sequence, rows);
    const report = String.fromCharCode(...sequence);
    const older = report.startsWith(`\u001b[<${WHEEL_UP};`);
    const furthest = Math.max(0, HISTORY_LINES - this.rows);
    this.offset = Math.min(furthest, Math.max(0, this.offset + (older ? rows : -rows)));
    this.paint();
  }

  private paint(): void {
    const last = HISTORY_LINES - this.offset;
    const lines: string[] = [];
    for (let line = last - this.rows + 2; line <= last; line += 1) lines.push(`history ${line}`);
    lines.push(`scrolled back ${this.offset}`);
    this.emit(ENCODER_OUT(`\u001b[2J\u001b[H${lines.join('\r\n')}`));
  }
}
