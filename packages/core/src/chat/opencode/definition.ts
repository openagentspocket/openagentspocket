import { openCodeSupport } from '../../blocked/opencode-support';
import { message } from '../../errors/text';
import { openCodeID } from '../model/session-ids';
import type { ProgramDefinition } from '../programs/definition';
import { OPENCODE_SHORTCUTS } from '../programs/shortcut-lists';
import { locateNoTranscriptFile } from '../store/locate';
import { openCodeAdapter } from './adapter';
import { openCodeSendPolicy } from './send-policy';
import { openCodeStoreProblem } from './store-problems';

export const openCodeProgram: ProgramDefinition = {
  shortcuts: () => OPENCODE_SHORTCUTS,
  program: 'opencode',
  chatName: 'OpenCode',
  noSessionMessage: () =>
    message(
      "herdr hasn't reported an OpenCode conversation for this Agent yet. OpenCode reports one once a conversation is open: send a first message in the terminal, or open a session there. Chat will keep checking, and you can continue in the Agent terminal.",
    ),
  locate: locateNoTranscriptFile,
  sessionID: openCodeID,
  adapter: openCodeAdapter,
  sendPolicy: openCodeSendPolicy,
  storeProblem: openCodeStoreProblem,
  blocked: () => openCodeSupport,
};
