import { describe, expect, it } from 'vitest';
import { encodeQuickKey } from './key-encoding';
import { TerminalKeyboardControl } from './keyboard-control';
import { character, FUNCTION_KEYS, NAMED_KEYS, NO_MODIFIERS, type QuickKey } from './quick-keys';

const ctrl = { ...NO_MODIFIERS, control: true };
const alt = { ...NO_MODIFIERS, option: true };
const shift = { ...NO_MODIFIERS, shift: true };
const str = (bytes: Uint8Array | null) => (bytes ? new TextDecoder().decode(bytes) : null);
const enc = (key: QuickKey, m = NO_MODIFIERS, applicationCursor = false) =>
  str(encodeQuickKey(key, m, { applicationCursor }));

describe('key encoding table', () => {
  it('encodes the plain keys', () => {
    expect(enc('escape')).toBe('\u001b');
    expect(enc('tab')).toBe('\t');
    expect(enc('enter')).toBe('\r');
    expect(enc('backspace')).toBe('\u007f');
    expect(enc('up')).toBe('\u001b[A');
    expect(enc('down')).toBe('\u001b[B');
    expect(enc('right')).toBe('\u001b[C');
    expect(enc('left')).toBe('\u001b[D');
    expect(enc('home')).toBe('\u001b[H');
    expect(enc('end')).toBe('\u001b[F');
    expect(enc('insert')).toBe('\u001b[2~');
    expect(enc('forwardDelete')).toBe('\u001b[3~');
    expect(enc('pageUp')).toBe('\u001b[5~');
    expect(enc('pageDown')).toBe('\u001b[6~');
  });

  it('encodes function keys', () => {
    expect(enc('f1')).toBe('\u001bOP');
    expect(enc('f4')).toBe('\u001bOS');
    expect(enc('f5')).toBe('\u001b[15~');
    expect(enc('f12')).toBe('\u001b[24~');
    expect(enc('f1', ctrl)).toBe('\u001b[1;5P');
    expect(enc('f5', shift)).toBe('\u001b[15;2~');
  });

  it('has an encoding for every key without modifiers', () => {
    for (const key of [...NAMED_KEYS, ...FUNCTION_KEYS]) expect(enc(key)).not.toBeNull();
  });

  it('uses SS3 for cursor keys in application mode, CSI once a modifier is held', () => {
    expect(enc('up', NO_MODIFIERS, true)).toBe('\u001bOA');
    expect(enc('end', NO_MODIFIERS, true)).toBe('\u001bOF');
    expect(enc('up', ctrl, true)).toBe('\u001b[1;5A');
    expect(enc('left', shift)).toBe('\u001b[1;2D');
    expect(enc('right', alt)).toBe('\u001b[1;3C');
  });

  it('sends Shift-Tab as back-tab', () => {
    expect(enc('shiftTab')).toBe('\u001b[Z');
    expect(enc('tab', shift)).toBe('\u001b[Z');
  });

  it('keeps Shift-Enter as the multiline Ctrl-J, however it is asked for', () => {
    expect(enc('shiftEnter')).toBe('\n');
    expect(enc('enter', shift)).toBe('\n');
    expect(enc('shiftEnter', ctrl)).toBe('\n');
  });

  it('turns Ctrl plus a character into its control byte', () => {
    expect(enc(character('c'), ctrl)).toBe('\u0003');
    expect(enc(character('C'), ctrl)).toBe('\u0003');
    expect(enc(character('['), ctrl)).toBe('\u001b');
    expect(enc(character('\\'), ctrl)).toBe('\u001c');
    expect(enc(character(' '), ctrl)).toBe('\u0000');
    expect(enc(character('?'), ctrl)).toBe('\u007f');
    expect(enc(character('2'), ctrl)).toBe('\u0000');
    expect(enc(character('7'), ctrl)).toBe('\u001f');
    expect(enc(character('1'), ctrl)).toBeNull();
  });

  it('prefixes Alt with Escape', () => {
    expect(enc(character('b'), alt)).toBe('\u001bb');
    expect(enc(character('b'), { ...ctrl, option: true })).toBe('\u001b\u0002');
    expect(enc('backspace', alt)).toBe('\u001b\u007f');
  });

  it('applies Shift with the US layout', () => {
    expect(enc(character('a'), shift)).toBe('A');
    expect(enc(character('1'), shift)).toBe('!');
    expect(enc(character('/'), shift)).toBe('?');
    expect(enc(character('['), shift)).toBe('{');
    expect(enc(character(' '))).toBe(' ');
  });
});

describe('sticky modifiers', () => {
  function setup() {
    const sent: string[] = [];
    let live = true;
    const control = new TerminalKeyboardControl({
      send: (bytes) => {
        if (!live) return false;
        sent.push(new TextDecoder().decode(bytes));
        return true;
      },
    });
    return { control, sent, setLive: (value: boolean) => (live = value) };
  }

  it('arms Ctrl for exactly the next key', () => {
    const { control, sent } = setup();
    control.toggleModifier('control');
    expect(control.latch('control')).toBe('armed');
    control.sendQuickKey(character('c'));
    control.sendQuickKey(character('c'));
    expect(sent).toEqual(['\u0003', 'c']);
    expect(control.latch('control')).toBe('off');
  });

  it('keeps a locked modifier until it is tapped off', () => {
    const { control, sent } = setup();
    control.lockModifier('control');
    expect(control.latch('control')).toBe('locked');
    control.sendQuickKey(character('a'));
    control.sendQuickKey(character('b'));
    expect(sent).toEqual(['\u0001', '\u0002']);
    control.toggleModifier('control');
    expect(control.latch('control')).toBe('off');
    control.sendQuickKey(character('a'));
    expect(sent.at(-1)).toBe('a');
  });

  it('does not consume an armed modifier when nothing was sent', () => {
    const { control, sent, setLive } = setup();
    control.toggleModifier('control');
    setLive(false);
    expect(control.sendQuickKey(character('c'))).toBe(false);
    expect(control.latch('control')).toBe('armed');
    setLive(true);
    control.sendQuickKey(character('c'));
    expect(sent).toEqual(['\u0003']);
  });

  it('combines armed modifiers with a hardware one', () => {
    const { control, sent } = setup();
    control.toggleModifier('option');
    control.sendQuickKey(character('b'), { ...NO_MODIFIERS, control: true });
    expect(sent).toEqual(['\u001b\u0002']);
  });

  it('sends Ctrl-C and releases one-shot modifiers', () => {
    const { control, sent } = setup();
    control.toggleModifier('shift');
    control.sendInterrupt();
    expect(sent).toEqual(['\u0003']);
    expect(control.latch('shift')).toBe('off');
  });

  it('applies an armed Ctrl to a single typed character, and passes longer text raw', () => {
    const { control, sent } = setup();
    control.toggleModifier('control');
    control.typed('d');
    control.typed('d');
    control.toggleModifier('control');
    control.typed('hello');
    expect(sent).toEqual(['\u0004', 'd', 'hello']);
  });
});
