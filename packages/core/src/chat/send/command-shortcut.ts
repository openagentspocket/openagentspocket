// What a command shortcut types, and on which surface (`CommandPlace`). A command that runs in the
// conversation goes into Chat's draft as `/name `, for Chat's send rules to rewrite into the
// program's form. Any other goes to the Agent's terminal, typed as the program submits it: OpenCode
// takes its commands bare, where a trailing space would hand the text to the model as a prompt.

import type { ComposerRoute } from '../../composer/policy';
import type { ProgramShortcut } from '../programs/shortcuts';
import type { ChatCommand, ProgramSendPolicy } from './policy';

export type CommandShortcut = Extract<ProgramShortcut, { kind: 'command' }>;

/** The draft a command shortcut writes, and the surface it is sent from. */
export interface ShortcutDraft {
  readonly surface: ComposerRoute;
  readonly text: string;
}

/** The command as Chat's send rules know it, so the program's own submission applies. */
function asChatCommand(name: string): ChatCommand {
  return {
    name,
    summary: null,
    kind: name === 'compact' ? { type: 'compact' } : { type: 'program' },
    isEnabled: true,
  };
}

/** `command` typed the way the program runs it from its input box. */
export function terminalCommandText(command: string, policy: ProgramSendPolicy | null): string {
  const name = command.startsWith('/') ? command.slice(1) : command;
  const submission = policy?.profile.submission?.(asChatCommand(name));
  return submission?.kind === 'bare' ? `/${name}` : `/${name} `;
}

/**
 * Where a command shortcut tapped on `from` goes. Chat keeps only a command that runs in the
 * conversation, and only for a program it sends to; every other command moves to the terminal.
 */
export function commandShortcutDraft(
  shortcut: CommandShortcut,
  from: ComposerRoute,
  policy: ProgramSendPolicy | null,
): ShortcutDraft {
  if (from === 'chat' && shortcut.runsIn === 'conversation' && policy) {
    return { surface: 'chat', text: `${shortcut.command} ` };
  }
  return { surface: 'terminal', text: terminalCommandText(shortcut.command, policy) };
}
