import { claudeSupport } from '../../blocked/claude-support';
import { claudeAdapter } from '../engine/adapter';
import { canonicalUUID } from '../model/session-ids';
import type { ProgramDefinition } from '../programs/definition';
import { claudeSendPolicy } from './send-policy';

export const claudeProgram: ProgramDefinition = {
  program: 'claude',
  chatName: 'Claude Code',
  sessionID: canonicalUUID,
  adapter: () => claudeAdapter,
  sendPolicy: () => claudeSendPolicy,
  blocked: () => claudeSupport,
};
