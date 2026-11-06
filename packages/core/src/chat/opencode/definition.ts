import { openCodeSupport } from '../../blocked/opencode-support';
import { message } from '../../errors/text';
import { openCodeID } from '../model/session-ids';
import type { ProgramDefinition } from '../programs/definition';
import { openCodeAdapter } from './adapter';
import { locateOpenCodeTranscript } from './locate';
import { openCodeSendPolicy } from './send-policy';

export const openCodeProgram: ProgramDefinition = {
  program: 'opencode',
  chatName: 'OpenCode',
  noSessionMessage: () =>
    message(
      "herdr hasn't reported an OpenCode conversation for this Agent yet. OpenCode reports one once a conversation is open: send a first message in the terminal, or open a session there. Chat will keep checking, and you can continue in the Agent terminal.",
    ),
  locate: locateOpenCodeTranscript,
  sessionID: openCodeID,
  adapter: openCodeAdapter,
  sendPolicy: openCodeSendPolicy,
  blocked: () => openCodeSupport,
};
