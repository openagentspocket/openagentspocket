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
