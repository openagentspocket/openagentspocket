import { ompSupport } from '../../blocked/omp-support';
import { canonicalUUID } from '../model/session-ids';
import type { ProgramDefinition } from '../programs/definition';
import { piAdapter } from './adapter';
import { piSendPolicy } from './send-policy';

/** Pi and Oh My Pi share a transcript format and a send policy; only Oh My Pi has Blocked dialogs. */
export function piProgram(program: 'pi' | 'omp', chatName: string): ProgramDefinition {
  return {
    program,
    chatName,
    sessionID: canonicalUUID,
    acceptsTranscriptPath: true,
    adapter: () => piAdapter(program),
    sendPolicy: () => piSendPolicy(program),
    ...(program === 'omp' ? { blocked: () => ompSupport } : {}),
  };
}
