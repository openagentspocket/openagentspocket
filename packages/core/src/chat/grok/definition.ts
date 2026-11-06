import { grokSupport } from '../../blocked/grok-support';
import { message } from '../../errors/text';
import { lowercaseUUIDv7 } from '../model/session-ids';
import type { ProgramDefinition } from '../programs/definition';
import { grokAdapter } from './adapter';
import { locateGrokTranscript } from './locate';
import { grokSendPolicy } from './send-policy';

export const grokProgram: ProgramDefinition = {
  program: 'grok',
  chatName: 'Grok Build',
  noSessionMessage: () =>
    message(
      "herdr hasn't reported a Grok Build session ID for this Agent. Grok Build reports one when a session starts, including after /new or /clear. Chat keeps checking; you can continue in the Agent terminal.",
    ),
  locate: locateGrokTranscript,
  sessionID: lowercaseUUIDv7,
  adapter: grokAdapter,
  sendPolicy: grokSendPolicy,
  blocked: () => grokSupport,
};
