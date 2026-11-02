import { describe, expect, it } from 'vitest';
import { snippetFromPaneText } from './snippet';

describe('snippetFromPaneText', () => {
  it('skips box frames and numbered options to find the question', () => {
    const dialog = [
      '╭──────────────────────────────────────╮',
      '│ Bash command                         │',
      '│                                      │',
      '│   rm -rf build                       │',
      '│                                      │',
      '│ Do you want to proceed?              │',
      '│ ❯ 1. Yes                             │',
      '│   2. No, and tell Claude what to do  │',
      '╰──────────────────────────────────────╯',
    ].join('\n');
    expect(snippetFromPaneText(dialog)).toBe('Do you want to proceed?');
  });

  it('joins a wrapped question that sits above described options and a key hint', () => {
    const text = [
      '❯ Ask me for permission',
      '────────────────────────────────────────',
      ' ☐ Demo',
      '',
      'Demo: may I create an empty test file in',
      'the scratchpad (/tmp/x/demo.txt)? It touches',
      'nothing else.',
      '',
      '❯ 1. Sure, create it',
      '     Creates demo.txt, harmless.',
      '  2. No, just a demo',
      '  3. Type something.',
      '────────────────────────────────────────',
      '  4. Chat about this',
      '',
      'Enter to select · ↑/↓ to navigate · Esc to cancel',
    ].join('\n');
    expect(snippetFromPaneText(text)).toBe(
      'Demo: may I create an empty test file in the scratchpad (/tmp/x/demo.txt)? It touches nothing else.',
    );
  });

  it('does not treat key hints, or only frames, as a prompt', () => {
    expect(snippetFromPaneText('Enter to select · Esc to cancel\n')).toBeUndefined();
    expect(snippetFromPaneText('\n ╰──╯ \n')).toBeUndefined();
    expect(snippetFromPaneText('')).toBeUndefined();
  });

  it('falls back to the last line with text when nothing asks', () => {
    expect(snippetFromPaneText('Working\n› Continue\n\n')).toBe('Continue');
  });

  it('prefers the last question over a later statement', () => {
    expect(snippetFromPaneText('Allow this?\nSome trailing status')).toBe('Allow this?');
  });

  it('bounds a long line to 240 characters ending in an ellipsis', () => {
    const snippet = snippetFromPaneText(`${'x'.repeat(500)}?`);
    expect([...(snippet ?? '')]).toHaveLength(240);
    expect(snippet?.endsWith('…')).toBe(true);
  });
});
