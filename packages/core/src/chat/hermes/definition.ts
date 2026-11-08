import { message } from '../../errors/text';
import { hermesID } from '../model/session-ids';
import type { ProgramDefinition } from '../programs/definition';
import { HERMES_SHORTCUTS } from '../programs/shortcut-lists';
import { locateNoTranscriptFile } from '../store/locate';
import { hermesAdapter } from './adapter';
import { discoverHermesSession } from './discover';
import { hermesSendPolicy } from './send-policy';
import { hermesStoreProblem } from './store-problems';

export const hermesProgram: ProgramDefinition = {
  shortcuts: () => HERMES_SHORTCUTS,
  program: 'hermes',
  chatName: 'Hermes Agent',
  noSessionMessage: () =>
    message(
      "herdr hasn't reported a Hermes Agent conversation for this Agent yet. Hermes reports one through herdr's Hermes integration once a conversation is open. If this lasts, run herdr integration install hermes on the Host. Chat will keep checking, and you can continue in the Agent terminal.",
    ),
  discoverSession: discoverHermesSession,
  locate: locateNoTranscriptFile,
  sessionID: hermesID,
  adapter: hermesAdapter,
  sendPolicy: hermesSendPolicy,
  storeProblem: hermesStoreProblem,
};
