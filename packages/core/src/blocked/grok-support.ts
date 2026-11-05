// The Blocked card's parser and planner for Grok Build (1.0.62).

import { parseGrokDialog } from './grok-parser';
import { planGrokAction } from './grok-planner';
import type { BlockedProgramSupport } from './programs';

export const grokSupport: BlockedProgramSupport | null = {
  parse: parseGrokDialog,
  plan: (dialog, action) => planGrokAction(dialog, action),
};
