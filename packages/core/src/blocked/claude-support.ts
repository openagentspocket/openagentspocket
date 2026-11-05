import { parseClaudeDialog } from './claude-parser';
import { planClaudeAction } from './claude-planner';
import type { BlockedProgramSupport } from './programs';

export const claudeSupport: BlockedProgramSupport = {
  parse: parseClaudeDialog,
  plan: planClaudeAction,
  genericOptions: {
    refusesWhileCursorInField: true,
    confirmation: { kind: 'fingerprintChange' },
  },
  readsScreenWhenIdleWithOpenQuestion: true,
};
