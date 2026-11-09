import { codexSupport } from '../../blocked/codex-support';
import { message } from '../../errors/text';
import { codexAdapter } from '../engine/adapter';
import { canonicalUUID } from '../model/session-ids';
import type { ProgramDefinition } from '../programs/definition';
import { CODEX_MODES } from '../programs/mode-lists';
import { CODEX_SHORTCUTS } from '../programs/shortcut-lists';
import { locateCodexTranscript } from './locate';
import { codexSendPolicy } from './send-policy';

export const codexProgram: ProgramDefinition = {
  modes: () => CODEX_MODES,
  shortcuts: () => CODEX_SHORTCUTS,
  program: 'codex',
  chatName: 'Codex',
  noSessionMessage: () =>
    message('Codex reports its conversation after a prompt. Send one to show it here.'),
  locate: locateCodexTranscript,
  sessionID: canonicalUUID,
  movesFileOnRewrite: true,
  adapter: () => codexAdapter,
  sendPolicy: () => codexSendPolicy,
  blocked: () => codexSupport,
};
