// What a command shortcut types, and on which surface (`CommandPlace`). A command that runs in the
// conversation goes into Chat's draft as `/name `, for Chat's send rules to rewrite into the
// program's form. Any other goes to the Agent's terminal, typed as the program submits it: OpenCode
// takes its commands bare, where a trailing space would hand the text to the model as a prompt.

import type { ComposerRefusal, ComposerRoute } from '../../composer/policy';
import { programShortcuts } from '../programs/registry';
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

/** `/name` with the arguments the user typed, in the form the program runs from its input box. */
export function terminalCommandWithArguments(
  name: string,
  args: string,
  policy: ProgramSendPolicy | null,
): string {
  const text = terminalCommandText(name, policy);
  return args === '' ? text : `${text.trimEnd()} ${args}`;
}

/**
 * The refusal for a `/name` Chat's menu does not offer. It carries what the terminal accepts, the
 * same text a tapped shortcut types, and whether the program's own command list knows the name.
 */
export function unknownCommandRefusal(
  name: string,
  args: string,
  policy: ProgramSendPolicy,
): Extract<ComposerRefusal, { kind: 'unknownCommand' }> {
  const known = programShortcuts(policy.program).some(
    (shortcut) =>
      shortcut.kind === 'command' && shortcut.command.slice(1).toLowerCase() === name.toLowerCase(),
  );
  return {
    kind: 'unknownCommand',
    name,
    known,
    terminalText: terminalCommandWithArguments(name, args, policy),
  };
}
