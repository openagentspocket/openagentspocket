// The Blocked card's parser and planner for Oh My Pi, registered by `blocked/programs.ts`.

import { parseOmpDialog } from './omp-parser';
import { planOmpAction } from './omp-planner';
import type { BlockedProgramSupport } from './programs';

export const ompSupport: BlockedProgramSupport | null = {
  parse: parseOmpDialog,
  plan: planOmpAction,
};
