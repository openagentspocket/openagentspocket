import { grokSupport } from '../../blocked/grok-support';
import { lowercaseUUIDv7 } from '../model/session-ids';
import type { ProgramDefinition } from '../programs/definition';
import { grokAdapter } from './adapter';
import { grokSendPolicy } from './send-policy';

export const grokProgram: ProgramDefinition = {
  program: 'grok',
  chatName: 'Grok Build',
  sessionID: lowercaseUUIDv7,
  adapter: grokAdapter,
  sendPolicy: grokSendPolicy,
  blocked: () => grokSupport,
};
