import { utf8Encode } from 'agentico-ssh';
import { DemoAgentTuiSession } from './demoTerminal';

const WHEEL_UP = utf8Encode('\u001b[<64;40;12M');
const WHEEL_DOWN = utf8Encode('\u001b[<65;40;12M');

/** The last screen painted, read off the session's output queue. */
async function lastPaint(session: DemoAgentTuiSession, paints: number): Promise<string> {
  const iterator = session.output[Symbol.asyncIterator]();
  let text = '';
  for (let index = 0; index < paints; index += 1) {
    const { value } = await iterator.next();
    text = String.fromCharCode(...(value as Uint8Array));
  }
  return text;
}

describe('DemoAgentTuiSession', () => {
  it('asks for the mouse on the alternate screen', async () => {
    const session = new DemoAgentTuiSession(24);
    expect(await lastPaint(session, 1)).toContain('\u001b[?1000h');
  });

  it('walks its history by wheel, and stops at the newest line', async () => {
    const session = new DemoAgentTuiSession(24);
    session.scroll(WHEEL_UP, 3);
    session.scroll(WHEEL_DOWN, 1);
    session.scroll(WHEEL_DOWN, 9);
    expect(await lastPaint(session, 5)).toContain('scrolled back 0');
  });

  it('says how far back it stands', async () => {
    const session = new DemoAgentTuiSession(24);
    session.scroll(WHEEL_UP, 3);
    expect(await lastPaint(session, 3)).toContain('scrolled back 3');
  });
});
