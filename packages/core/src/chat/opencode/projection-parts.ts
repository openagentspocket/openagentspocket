// The pieces of the OpenCode projection that need no state: a run's shape, offsets and dates, the
// notices a note or a failed compaction shows (Swift OpenCodeTranscriptReducer private helpers).

import { notice } from '../model/factories';
import type { ChatNotice, ChatTurnEnd } from '../model/types';
import { trimmed } from '../store/text';
import type {
  OpenCodeError,
  OpenCodeNote,
  OpenCodeRowContent,
  OpenCodeStep,
  OpenCodeTool,
} from './record';
import { DECLINED_MESSAGES } from './tool-summary';

export type Place =
  | { kind: 'above'; seen: boolean }
  | { kind: 'turn'; index: number }
  | { kind: 'loose' };

/** The rows since the last turn boundary. */
export interface Run {
  place: Place;
  isEnded: boolean;
  /** A step OpenCode declined, while it is the run's last. */
  decline: { endedAt: string | null } | null;
  /** The error the run's last failed step showed. */
  failure: string | null;
  /** How the run ends if it ends at its newest step. */
  lastStep: ChatTurnEnd | null;
  /** Tool entries still running, oldest first (indexes into the entries). */
  runningTools: number[];
}

export const newRun = (place: Place, isEnded = false): Run => ({
  place,
  isEnded,
  decline: null,
  failure: null,
  lastStep: null,
  runningTools: [],
});

export const offsetOf = (seq: number) => Math.max(seq, 0);
export const dateOf = (milliseconds: number | null | undefined): string | null =>
  milliseconds == null ? null : new Date(milliseconds).toISOString();

export { compactionPreview, isCut, scalarCount, shown, trimmed } from '../store/text';

export const isDeclined = (tool: OpenCodeTool) =>
  tool.status === 'error' &&
  tool.error?.type === 'aborted' &&
  DECLINED_MESSAGES.has(tool.error.message ?? '');

export const stepTools = (step: OpenCodeStep): OpenCodeTool[] =>
  step.items.flatMap((item) => (item.kind.type === 'tool' ? [item.kind.tool] : []));

/** What a `synthetic`, `system` or `skill` row shows: its notice, and whether it shows OpenCode working again. Null for text the model alone reads. */
export function noteNotice(
  type: string,
  note: OpenCodeNote,
): { notice: ChatNotice; resumes: boolean } | null {
  switch (type) {
    case 'synthetic': {
      // OpenCode tells the model about a command the user ran in its shell mode, which the command's
      // own row shows.
      if (note.source === 'shell' && note.jobID === null && note.description === null) return null;
      // Text with neither metadata nor a description is for the model alone, such as Plan mode's
      // reminders: OpenCode's own screen never draws it.
      if (!note.hasMetadata && trimmed(note.description ?? '') === '') return null;
      if (note.notice === 'restart') {
        return { notice: notice('system', 'Continuing after a restart'), resumes: true };
      }
      if (note.source === 'subagent' || note.source === 'shell') {
        return {
          notice: notice('taskNotification', note.description ?? 'Background work finished', {
            detail: note.text,
          }),
          resumes: true,
        };
      }
      return {
        notice: notice('system', note.description ?? 'Note', { detail: note.text }),
        resumes: true,
      };
    }
    case 'skill': {
      const name = note.name ?? note.skill;
      return {
        notice: notice('command', name === null ? 'Skill' : `Skill ${name}`),
        resumes: false,
      };
    }
    default:
      return {
        notice: notice('system', note.description ?? 'Instructions updated'),
        resumes: false,
      };
  }
}

/**
 * OpenCode records a `/compact` with nothing new to compact as a failed compaction whose error says
 * so ("Nothing to compact yet"), and a `/compact` the user stopped as one whose `aborted` error says
 * "Compaction cancelled". Nothing failed, so Chat shows those words as a notice; a stop's own
 * "Interrupted" comes from its `idle` row. Any other failure, or a refusal without a message, is
 * "Compaction failed", with the message as its detail.
 */
export function failedCompactionNotice(error: OpenCodeError | null): {
  notice: ChatNotice;
  suffix: string;
} {
  const raw = error?.message ?? null;
  const message = raw !== null && trimmed(raw) !== '' ? raw : null;
  if (error?.type === 'aborted') {
    return { notice: notice('system', message ?? 'Compaction cancelled'), suffix: ':notice' };
  }
  if (error?.type === 'compaction.unavailable' && message !== null) {
    return { notice: notice('system', message), suffix: ':notice' };
  }
  return {
    notice: notice('error', 'Compaction failed', { detail: message }),
    suffix: ':error',
  };
}

/** What a step says besides its items: a retry, why it stopped, and its error (which is the run's failure unless the user aborted). */
export function stepNotices(
  step: OpenCodeStep,
  isFinal: boolean,
): { notices: { notice: ChatNotice; suffix: string }[]; failure: string | null } {
  const notices: { notice: ChatNotice; suffix: string }[] = [];
  if (!isFinal && step.retry) {
    const attempt = step.retry.attempt === null ? null : String(step.retry.attempt);
    const reason = step.retry.error?.message ?? null;
    let title = 'Retrying';
    if (attempt !== null && reason !== null) title = `Retrying (attempt ${attempt}): ${reason}`;
    else if (attempt !== null) title = `Retrying (attempt ${attempt})`;
    else if (reason !== null) title = `Retrying: ${reason}`;
    notices.push({ notice: notice('system', title), suffix: ':retry' });
  }
  if (step.finish === 'length') {
    notices.push({
      notice: notice('system', 'The model stopped at its output limit.'),
      suffix: ':finish',
    });
  } else if (step.finish === 'content-filter') {
    notices.push({
      notice: notice('system', 'The provider filtered the reply.'),
      suffix: ':finish',
    });
  }
  let failure: string | null = null;
  if (step.error && step.error.type !== 'aborted') {
    failure = step.error.message ?? 'The step failed';
    notices.push({ notice: notice('error', failure), suffix: ':error' });
  }
  return { notices, failure };
}

/** The notice an agent, model or location switch shows; null when the row names nothing. */
export function switchNotice(content: OpenCodeRowContent): ChatNotice | null {
  switch (content.type) {
    case 'agentSwitched':
      return content.agent === null ? null : notice('modelChange', `Agent: ${content.agent}`);
    case 'modelSwitched':
      return content.model === null ? null : notice('modelChange', `Model: ${content.model}`);
    case 'locationSwitched':
      return content.directory === null ? null : notice('system', `Moved to ${content.directory}`);
    default:
      return null;
  }
}
