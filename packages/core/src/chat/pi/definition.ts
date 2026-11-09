import { ompSupport } from '../../blocked/omp-support';
import { message } from '../../errors/text';
import { canonicalUUID } from '../model/session-ids';
import type { ProgramDefinition } from '../programs/definition';
import { OMP_MODES, PI_MODES } from '../programs/mode-lists';
import { OMP_SHORTCUTS, PI_SHORTCUTS } from '../programs/shortcut-lists';
import { piAdapter } from './adapter';
import { locatePiTranscript } from './locate';
import { piSendPolicy } from './send-policy';

/** Pi and Oh My Pi share a transcript format and a send policy; only Oh My Pi has Blocked dialogs. */
export function piProgram(program: 'pi' | 'omp', chatName: string): ProgramDefinition {
  return {
    program,
    chatName,
    modes: () => (program === 'pi' ? PI_MODES : OMP_MODES),
    shortcuts: () => (program === 'pi' ? PI_SHORTCUTS : OMP_SHORTCUTS),
    noSessionMessage: () =>
      message(
        program === 'pi'
          ? "herdr hasn't reported a Pi conversation for this Agent yet. Pi reports it once it has started, after you answer whether to trust the project folder. If this lasts, check the Pi integration on the Host. Chat will keep checking, and you can continue in the Agent terminal."
          : "herdr hasn't reported an Oh My Pi conversation for this Agent yet. Oh My Pi reports it once it has started. If this lasts, check the OMP integration on the Host. Chat will keep checking, and you can continue in the Agent terminal.",
      ),
    locate: locatePiTranscript,
    sessionID: canonicalUUID,
    acceptsTranscriptPath: true,
    adapter: () => piAdapter(program),
    sendPolicy: () => piSendPolicy(program),
    ...(program === 'omp' ? { blocked: () => ompSupport } : {}),
  };
}
