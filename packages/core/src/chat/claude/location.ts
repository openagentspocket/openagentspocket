// Where a Claude Code session's files live, and the path-safety rules for names the transcript
// supplies (Swift ClaudeTranscriptLocation, ClaudeProjectKey).

import { isAcceptablePath, isSafeComponent, joinPath } from '../model/paths';

export interface ClaudeTranscriptLocation {
  /** `<config>/projects/<key>`, which also holds `<session>/subagents/`. */
  projectDirectory: string;
  transcriptPath: string;
  sessionID: string;
}

/** `<session>/subagents/agent-<agentId>.jsonl` beside the session file at `transcriptPath`. */
export function subagentTranscriptPath(transcriptPath: string, agentID: string): string | null {
  if (!transcriptPath.endsWith('.jsonl') || !isSafeComponent(agentID)) return null;
  const session = transcriptPath.slice(0, -'.jsonl'.length);
  const path = joinPath(session, 'subagents', `agent-${agentID}.jsonl`);
  return isAcceptablePath(path) ? path : null;
}

/** `wf_` and 1 to 61 ASCII letters, digits or hyphens. */
export function isWorkflowRunID(id: string): boolean {
  return /^wf_[A-Za-z0-9-]{1,61}$/.test(id);
}

/** `<session>/subagents/workflows/<runId>/journal.jsonl`; only the run id comes from the transcript. */
export function workflowJournalPath(transcriptPath: string, runID: string): string | null {
  if (!transcriptPath.endsWith('.jsonl') || !isWorkflowRunID(runID)) return null;
  const session = transcriptPath.slice(0, -'.jsonl'.length);
  const path = joinPath(session, 'subagents', 'workflows', runID, 'journal.jsonl');
  return isAcceptablePath(path) ? path : null;
}

export function locationSubagentPath(
  location: ClaudeTranscriptLocation,
  agentID: string,
): string | null {
  if (!isSafeComponent(agentID)) return null;
  return joinPath(
    location.projectDirectory,
    location.sessionID,
    'subagents',
    `agent-${agentID}.jsonl`,
  );
}

export const MAXIMUM_PROJECT_KEY_LENGTH = 200;

function sanitize(units: number[]): string {
  return units
    .map((unit) =>
      (unit >= 0x30 && unit <= 0x39) ||
      (unit >= 0x41 && unit <= 0x5a) ||
      (unit >= 0x61 && unit <= 0x7a)
        ? String.fromCharCode(unit)
        : '-',
    )
    .join('');
}

function utf16(text: string): number[] {
  const units: number[] = [];
  for (let i = 0; i < text.length; i += 1) units.push(text.charCodeAt(i));
  return units;
}

/** The CLI's string hash: 32-bit `hash * 31 + unit`, absolute value in base 36. */
export function hashSuffix(units: number[]): string {
  let hash = 0;
  for (const unit of units) hash = (Math.imul(hash, 31) + unit) | 0;
  return Math.abs(hash).toString(36);
}

function keyOf(units: number[]): string {
  const sanitized = sanitize(units);
  return units.length > MAXIMUM_PROJECT_KEY_LENGTH
    ? `${sanitized.slice(0, MAXIMUM_PROJECT_KEY_LENGTH)}-${hashSuffix(units)}`
    : sanitized;
}

/** The project directory name Claude Code files a session under: every non-alphanumeric UTF-16 unit becomes `-`. */
export function projectKey(directory: string): string {
  return keyOf(utf16(directory.normalize('NFC')));
}

/** Same, without NFC normalization (the CLI may not normalize). */
export function unnormalizedProjectKey(directory: string): string {
  return keyOf(utf16(directory));
}

/** For a key over 200 units, whose hash the CLI may compute differently: the shared prefix. */
export function longProjectKeyPrefix(directory: string): string | null {
  const units = utf16(directory.normalize('NFC'));
  return units.length > MAXIMUM_PROJECT_KEY_LENGTH
    ? `${sanitize(units).slice(0, MAXIMUM_PROJECT_KEY_LENGTH)}-`
    : null;
}
