import { claudeSupport } from '../../blocked/claude-support';
import { message } from '../../errors/text';
import { claudeAdapter } from '../engine/adapter';
import { canonicalUUID } from '../model/session-ids';
import type { ProgramDefinition } from '../programs/definition';
import { CLAUDE_MODES } from '../programs/mode-lists';
import { CLAUDE_SHORTCUTS } from '../programs/shortcut-lists';
import { locateClaudeTranscript } from './locate';
import { claudeSendPolicy } from './send-policy';

export const claudeProgram: ProgramDefinition = {
  modes: () => CLAUDE_MODES,
  shortcuts: () => CLAUDE_SHORTCUTS,
  program: 'claude',
  chatName: 'Claude Code',
  noSessionMessage: () =>
    message(
      "herdr hasn't reported a Claude Code session ID for this Agent. Chat will keep checking. You can continue in the Agent terminal.",
    ),
  locate: locateClaudeTranscript,
  sessionID: canonicalUUID,
  adapter: () => claudeAdapter,
  sendPolicy: () => claudeSendPolicy,
  blocked: () => claudeSupport,
  readsSubagentTranscripts: true,
};
