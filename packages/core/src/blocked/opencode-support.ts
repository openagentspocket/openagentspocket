// The Blocked card's parser and planner for OpenCode, registered through `programs.ts`.

import { parseOpenCodeDialog } from './opencode-parser';
import { planOpenCodeAction } from './opencode-planner';
import type { BlockedProgramSupport } from './programs';

export const openCodeSupport: BlockedProgramSupport | null = {
  parse: parseOpenCodeDialog,
  plan: planOpenCodeAction,
};
