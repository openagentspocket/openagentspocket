// Each program's shortcuts, from its own documentation (read 2026-11-08). Only keys that act the same
// whatever the draft holds, and commands that need no argument. Esc does not interrupt Hermes or
// Grok: Ctrl+C does there.
//
// Claude Code: code.claude.com/docs/en/interactive-mode, /commands
// Codex: github.com/openai/codex codex-rs/tui (keymap.rs, slash_command.rs), rust-v0.167.0
// OpenCode: docs.opencode.ai/docs/keybinds, /tui
// Hermes: hermes-agent.nousresearch.com/docs/user-guide/cli
// Pi: github.com/badlogic/pi-mono packages/coding-agent/docs/usage.md, keybindings.md
// Oh My Pi: github.com/can1357/oh-my-pi docs/keybindings.md, omp.sh/docs/slash
// Grok Build: docs.x.ai/build/keyboard-shortcuts, /build/features/sessions
//
// Where each command runs (`CommandPlace`): only `/compact` goes from Chat, which offers it in its
// menu and confirms it by the compaction the program records. Every other command opens a picker
// or a dialog (`/model`, `/models`, `/resume`, `/sessions`, `/tree`, `/fork`, `/review`,
// `/usage`), shows its result only on the program's screen (`/diff`, `/status`, `/context`),
// moves the program to a conversation herdr may not report (`/new`, `/clear`), or leaves text in
// the input box that holds Chat's next send (OpenCode `/undo`), so it is typed in the terminal.

import {
  commandShortcut as command,
  keysShortcut as keys,
  type ProgramShortcut,
} from './shortcuts';

const interruptEsc = keys('Interrupt', 'Esc', 'esc');
const interruptCtrlC = keys('Interrupt', 'Ctrl+C', 'ctrl+c');
const rewind = keys('Rewind', 'Esc Esc', 'esc', 'esc');
const compact = command('/compact', 'Compact Conversation', 'conversation');
const model = command('/model', 'Change Model');
const resume = command('/resume', 'Resume a Session');

export const CLAUDE_SHORTCUTS: readonly ProgramShortcut[] = [
  interruptEsc,
  keys('Switch Mode', 'Shift+Tab', 'shift+tab'),
  rewind,
  keys('Run in Background', 'Ctrl+B', 'ctrl+b'),
  keys('Show Tasks', 'Ctrl+T', 'ctrl+t'),
  command('/clear', 'Clear Conversation'),
  compact,
  model,
  resume,
  command('/context', 'Context Usage'),
  command('/usage', 'Plan Usage'),
];

export const CODEX_SHORTCUTS: readonly ProgramShortcut[] = [
  interruptEsc,
  keys('Plan Mode', 'Shift+Tab', 'shift+tab'),
  keys('Edit a Previous Prompt', 'Esc Esc', 'esc', 'esc'),
  command('/new', 'New Conversation'),
  compact,
  model,
  resume,
  command('/review', 'Review Changes'),
  command('/diff', 'Show Diff'),
  command('/status', 'Session Status'),
];

export const OPENCODE_SHORTCUTS: readonly ProgramShortcut[] = [
  interruptEsc,
  // OpenCode 2.1.3 cycles its agents (Build, Plan) with Shift+Tab, as its footer says; Tab does
  // nothing there (agent lab, goldens/opencode/lab).
  keys('Switch Agent', 'Shift+Tab', 'shift+tab'),
  command('/new', 'New Conversation'),
  compact,
  command('/undo', 'Undo'),
  command('/redo', 'Redo'),
  command('/models', 'Change Model'),
  command('/sessions', 'Resume a Session'),
];

export const HERMES_SHORTCUTS: readonly ProgramShortcut[] = [
  interruptCtrlC,
  rewind,
  command('/stop', 'Stop'),
  model,
  command('/status', 'Session Status'),
  command('/context', 'Context Usage'),
  command('/usage', 'Plan Usage'),
  command('/sessions', 'Resume a Session'),
];

const PI_COMMON: readonly ProgramShortcut[] = [
  interruptEsc,
  keys('Thinking Level', 'Shift+Tab', 'shift+tab'),
  keys('Next Model', 'Ctrl+P', 'ctrl+p'),
  keys('Expand Tool Output', 'Ctrl+O', 'ctrl+o'),
];

export const PI_SHORTCUTS: readonly ProgramShortcut[] = [
  ...PI_COMMON,
  command('/new', 'New Conversation'),
  compact,
  model,
  resume,
  command('/tree', 'Session Tree'),
  command('/fork', 'Fork Session'),
];

export const OMP_SHORTCUTS: readonly ProgramShortcut[] = [
  ...PI_COMMON,
  keys('Retry', 'Alt+R', 'alt+r'),
  command('/new', 'New Conversation'),
  compact,
  model,
  resume,
  command('/plan', 'Plan Mode'),
  command('/usage', 'Plan Usage'),
];

export const GROK_SHORTCUTS: readonly ProgramShortcut[] = [
  interruptCtrlC,
  keys('Switch Mode', 'Shift+Tab', 'shift+tab'),
  rewind,
  keys('Run in Background', 'Ctrl+B', 'ctrl+b'),
  resume,
  compact,
  command('/context', 'Context Usage'),
  command('/fork', 'Fork Session'),
];
