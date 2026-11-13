import '../chat/programs';
// Which conversation request a dialog on screen asks about (Swift BlockedRequestMatch).

import { describe, expect, it } from 'vitest';
import type { ChatPendingRequest, ToolKind } from '../chat/model/types';
import { labScreen } from '../lab-captures.testkit';
import { parseBlockedDialog, planDialogAction } from './programs';
import { matchedRequest, type RequestContext } from './request-match';
import type { BlockedDialog } from './types';

function request(callID: string, kind: ToolKind, toolName: string, summary: string) {
  return {
    entryID: callID,
    callID,
    kind,
    toolName,
    summary,
    detail: null,
    questions: [],
    planFilePath: null,
  } satisfies ChatPendingRequest;
}

const shellDialog = (): BlockedDialog => {
  const parsed = parseBlockedDialog(labScreen('opencode', 'permission-shell'), 'opencode');
  if (parsed.kind !== 'dialog') throw new Error('no dialog');
  return parsed.dialog;
};

/** OpenCode's permission to start a subagent names only the agent (`# General Subagent`). */
const subagentDialog = (): BlockedDialog => {
  const dialog = shellDialog();
  return {
    ...dialog,
    body: ['General Subagent'],
    subject: { ...dialog.subject, toolName: 'General', command: null, notes: ['◉ Review'] },
  };
};

const context = (requests: ChatPendingRequest[], subagentRunning = false): RequestContext => ({
  requests,
  subagentRunning,
});

const ls = request('call_ls', 'command', 'shell', 'ls');
const task = request('call_task', 'agent', 'task', 'Review');

const rejectKeys = (dialog: BlockedDialog, ctx: RequestContext) => {
  const plan = planDialogAction(dialog, { kind: 'dismiss' }, matchedRequest(dialog, ctx)?.callID);
  return plan.ok ? plan.plan.steps : plan.error.kind;
};

describe('matchedRequest', () => {
  it("matches OpenCode's own shell permission to its call, so Reject sends Esc", () => {
    expect(matchedRequest(shellDialog(), context([ls]))?.callID).toBe('call_ls');
    expect(rejectKeys(shellDialog(), context([ls]))).toEqual([{ kind: 'keys', keys: ['esc'] }]);
  });

  it('matches no call for another command, so Reject stays in the terminal', () => {
    const other = request('call_pwd', 'command', 'shell', 'pwd');
    expect(matchedRequest(shellDialog(), context([other]))).toBeUndefined();
    expect(rejectKeys(shellDialog(), context([other]))).toBe('unsupported');
  });

  it("never matches a subagent's permission, whose rejection asks a follow-up", () => {
    expect(matchedRequest(subagentDialog(), context([task, ls]))).toBeUndefined();
    expect(rejectKeys(subagentDialog(), context([task, ls]))).toBe('unsupported');
  });

  it('matches no OpenCode call while a subagent runs, whose requests look the same', () => {
    expect(matchedRequest(shellDialog(), context([ls], true))).toBeUndefined();
    expect(rejectKeys(shellDialog(), context([ls], true))).toBe('unsupported');
  });

  it('takes the oldest of two calls the dialog matches', () => {
    const second = request('call_ls2', 'command', 'shell', 'ls');
    expect(matchedRequest(shellDialog(), context([ls, second]))?.callID).toBe('call_ls');
  });
});
