import { describe, expect, it } from 'vitest';
import { tmuxKeyArgs } from './keys.js';

describe('herdr key names on tmux', () => {
  it('presses named keys as tmux keys', () => {
    expect(tmuxKeyArgs('esc')).toEqual(['Escape']);
    expect(tmuxKeyArgs('escape')).toEqual(['Escape']);
    expect(tmuxKeyArgs('enter')).toEqual(['Enter']);
    expect(tmuxKeyArgs('tab')).toEqual(['Tab']);
    expect(tmuxKeyArgs('shift+tab')).toEqual(['BTab']);
    expect(tmuxKeyArgs('up')).toEqual(['Up']);
    expect(tmuxKeyArgs('backspace')).toEqual(['BSpace']);
  });

  it('presses modified keys', () => {
    expect(tmuxKeyArgs('ctrl+c')).toEqual(['C-c']);
    expect(tmuxKeyArgs('ctrl+]')).toEqual(['C-]']);
    expect(tmuxKeyArgs('alt+p')).toEqual(['M-p']);
  });

  it('types anything else literally, so an answer digit is never read as a key name', () => {
    expect(tmuxKeyArgs('2')).toEqual(['-l', '--', '2']);
    expect(tmuxKeyArgs('Enter now')).toEqual(['-l', '--', 'Enter now']);
  });
});
