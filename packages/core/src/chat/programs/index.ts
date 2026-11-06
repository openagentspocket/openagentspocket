import { claudeProgram } from '../claude/definition';
import { codexProgram } from '../codex/definition';
import { grokProgram } from '../grok/definition';
import { hermesProgram } from '../hermes/definition';
import { openCodeProgram } from '../opencode/definition';
import { piProgram } from '../pi/definition';
import { provideProgramDefinitions } from './registry';

export type { ProgramDefinition } from './definition';
export { programDefinition, programDefinitions } from './registry';

provideProgramDefinitions({
  claude: claudeProgram,
  codex: codexProgram,
  pi: piProgram('pi', 'Pi'),
  omp: piProgram('omp', 'Oh My Pi'),
  grok: grokProgram,
  opencode: openCodeProgram,
  hermes: hermesProgram,
});
