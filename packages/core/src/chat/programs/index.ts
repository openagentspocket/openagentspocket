import { claudeProgram } from '../claude/definition';
import { codexProgram } from '../codex/definition';
import { grokProgram } from '../grok/definition';
import { hermesProgram } from '../hermes/definition';
import { openCodeProgram } from '../opencode/definition';
import { piProgram } from '../pi/definition';
import { provideProgramDefinitions } from './registry';

export { footerCovered, readAgentMode } from './agent-mode';
export type { ProgramDefinition } from './definition';
export { modeLabel, type ProgramModes, readProgramMode } from './modes';
export {
  messageJumpProfile,
  type ProgramCommand,
  programCommands,
  programDefinition,
  programDefinitions,
  programModes,
  programShortcuts,
  readsSubagentTranscripts,
} from './registry';
export {
  COMMON_SHORTCUTS,
  type CommandArgument,
  type CommandPlace,
  commandShortcut,
  keysShortcut,
  menuCommand,
  type ProgramShortcut,
} from './shortcuts';
export { type TerminalWait, terminalWaitOn } from './terminal-waits';

provideProgramDefinitions({
  claude: claudeProgram,
  codex: codexProgram,
  pi: piProgram('pi', 'Pi'),
  omp: piProgram('omp', 'Oh My Pi'),
  grok: grokProgram,
  opencode: openCodeProgram,
  hermes: hermesProgram,
});
