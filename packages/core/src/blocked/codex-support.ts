import { parseCodexDialog } from './codex-parser';
import { planCodexAction } from './codex-planner';
import type { BlockedProgramSupport } from './programs';

export const codexSupport: BlockedProgramSupport = {
  parse: parseCodexDialog,
  plan: (dialog, action) => planCodexAction(dialog, action),
  genericOptions: { confirmation: { kind: 'fingerprintChangeOrUnblocked' } },
};
