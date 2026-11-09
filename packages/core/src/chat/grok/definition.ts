import { grokSupport } from '../../blocked/grok-support';
import { message } from '../../errors/text';
import { lowercaseUUIDv7 } from '../model/session-ids';
import type { ProgramDefinition } from '../programs/definition';
import { GROK_MODES } from '../programs/mode-lists';
import { GROK_SHORTCUTS } from '../programs/shortcut-lists';
import { grokAdapter } from './adapter';
import { locateGrokTranscript } from './locate';
import { grokSendPolicy } from './send-policy';

export const grokProgram: ProgramDefinition = {
  modes: () => GROK_MODES,
  shortcuts: () => GROK_SHORTCUTS,
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
  // Grok pins the current turn's prompt at the top, five columns in.
  messageJump: () => ({ policy: 'stickyPromptOvershoot', maximumPromptIndent: 5 }),
};
