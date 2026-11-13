import { randomBytes } from 'node:crypto';
import type { TmuxRunner } from './tmux.js';

/** CRLF and a lone CR are line breaks too; trailing ones are the submit key's job, not the text's. */
export const normalizeText = (text: string): string =>
  text.replaceAll('\r\n', '\n').replaceAll('\r', '\n').replace(/\n+$/u, '');

/** Named for this paste alone, so the user's own paste buffers are never touched. */
const bufferName = () => `oap-${process.pid}-${randomBytes(6).toString('hex')}`;

/** Single-line text: typed literally. `-l` keeps a word like "Enter" text, `--` a leading "-" an argument. */
export const typeArgs = (pane: string, text: string): string[] => [
  'send-keys',
  '-t',
  pane,
  '-l',
  '--',
  text,
];

/**
 * Multi-line text: one buffer, pasted once. `-p` brackets the paste when the pane's program asked for
 * it (it then takes the lines as text, not as Enter presses), `-r` keeps each line break as LF (tmux
 * would turn it into CR, which is Enter) and `-d` drops the buffer after use.
 */
export const pasteArgs = (pane: string, buffer: string): string[] => [
  'paste-buffer',
  '-p',
  '-r',
  '-d',
  '-b',
  buffer,
  '-t',
  pane,
];

/** The text is read from stdin (`load-buffer -`): no shell, no argument injection, no argv size limit. */
export const loadArgs = (buffer: string): string[] => ['load-buffer', '-b', buffer, '-'];

/**
 * Types `text` into `pane` as herdr's `pane.send_text` does: one message with its line breaks, never
 * submitted (the request's keys do that). A pane whose program did not enable bracketed paste gets the
 * lines raw, line breaks as LF (Ctrl-J: a new line in the TUIs that read it, Enter in a plain shell).
 */
export async function pasteOrType(tmux: TmuxRunner, pane: string, raw: string): Promise<void> {
  const text = normalizeText(raw);
  if (text === '') return;
  if (!text.includes('\n')) {
    await tmux.run(typeArgs(pane, text));
    return;
  }
  const buffer = bufferName();
  try {
    await tmux.run(loadArgs(buffer), text);
    await tmux.run(pasteArgs(pane, buffer));
  } catch (error) {
    // `-d` only deletes after a paste that happened.
    await tmux.run(['delete-buffer', '-b', buffer]).catch(() => '');
    throw error;
  }
}
