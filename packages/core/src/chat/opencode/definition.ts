import { openCodeSupport } from '../../blocked/opencode-support';
import { openCodeID } from '../model/session-ids';
import type { ProgramDefinition } from '../programs/definition';
import { openCodeAdapter } from './adapter';
import { openCodeSendPolicy } from './send-policy';

export const openCodeProgram: ProgramDefinition = {
  program: 'opencode',
  chatName: 'OpenCode',
  sessionID: openCodeID,
  adapter: openCodeAdapter,
  sendPolicy: openCodeSendPolicy,
  blocked: () => openCodeSupport,
};
