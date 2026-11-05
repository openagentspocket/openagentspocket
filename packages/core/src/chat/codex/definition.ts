import { codexSupport } from '../../blocked/codex-support';
import { codexAdapter } from '../engine/adapter';
import { canonicalUUID } from '../model/session-ids';
import type { ProgramDefinition } from '../programs/definition';
import { codexSendPolicy } from './send-policy';

export const codexProgram: ProgramDefinition = {
  program: 'codex',
  chatName: 'Codex',
  sessionID: canonicalUUID,
  movesFileOnRewrite: true,
  adapter: () => codexAdapter,
  sendPolicy: () => codexSendPolicy,
  blocked: () => codexSupport,
};
