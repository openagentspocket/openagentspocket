import { renderThemed } from '../test-utils';
import { GhosttyTerminal } from './GhosttyTerminal';

type Input = (event: { nativeEvent: { text: string } }) => void;
let nativeInput: Input;

jest.mock('expo-libghostty', () => ({
  TerminalView: ({ onInput }: { onInput: Input }) => {
    nativeInput = onInput;
    return null;
  },
}));

const typed = (text: string) => nativeInput({ nativeEvent: { text } });

describe('GhosttyTerminal', () => {
  it('passes typing on and keeps the renderer own wheel reports back', async () => {
    const onInput = jest.fn();
    await renderThemed(<GhosttyTerminal onInput={onInput} />);
    typed('a');
    typed('\u001b[A');
    typed('\u001b[<64;3;4M');
    typed('\u001b[<65;3;4M\u001b[<65;3;4M');
    expect(onInput.mock.calls).toEqual([['a'], ['\u001b[A']]);
  });
});
