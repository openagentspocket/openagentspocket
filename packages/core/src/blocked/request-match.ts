// Finds the transcript's request behind a dialog on screen (Swift `BlockedRequestMatch.request`).
// The screen decides what a card offers; the matched request gives each program's planner the call
// it may rely on (Claude confirms by its result, OpenCode rejects with Esc only for a call it can
// name). Ties go to the oldest request, since dialogs follow call order.

import type { ChatPendingRequest } from '../chat/model/types';
import { comparable } from './comparable';
import type { BlockedDialog, DialogSubject } from './types';

/** What the conversation tells a card about the requests a dialog may be asking about. */
export interface RequestContext {
  /** The calls waiting on the user, oldest first. */
  readonly requests: readonly ChatPendingRequest[];
  /**
   * A subagent of this conversation is running. OpenCode draws a running subagent's requests where
   * its own show, and their calls are not in this conversation, so an OpenCode dialog matches no
   * call then, even one that looks the same.
   */
  readonly subagentRunning: boolean;
}

export const NO_REQUESTS: RequestContext = { requests: [], subagentRunning: false };

/** The request `dialog` asks about, or undefined when none matches exactly. */
export function matchedRequest(
  dialog: BlockedDialog,
  context: RequestContext,
): ChatPendingRequest | undefined {
  return context.requests.find((request) => matches(request, dialog, context));
}

const FILE_EDITS = ['Edit', 'MultiEdit', 'Write', 'NotebookEdit'];

function matches(
  request: ChatPendingRequest,
  dialog: BlockedDialog,
  context: RequestContext,
): boolean {
  const { subject } = dialog;
  const tool = request.toolName;
  switch (dialog.kind) {
    case 'claudeBash':
      return ['Bash', 'PowerShell'].includes(tool) && begins(request.summary, subject.command);
    case 'claudeFileEdit':
    case 'claudeFileCreate':
      return FILE_EDITS.includes(tool) && sameFile(request.summary, subject.filePath);
    case 'claudeFileRead':
      return tool === 'Read' && samePath(request.summary, subject.filePath);
    case 'claudeFetch':
      return tool === 'WebFetch' && sameURL(request.summary, subject.url);
    case 'claudePlan':
      return tool === 'ExitPlanMode';
    case 'claudeQuestion':
      return tool === 'AskUserQuestion' && asks(request, subject.question ?? dialog.title);
    case 'claudeQuestionReview':
      return tool === 'AskUserQuestion';
    case 'codexExec':
      return request.kind === 'command' && overlaps(request.summary, subject.command);
    case 'codexPatch':
      return request.kind === 'fileEdit' || request.kind === 'fileWrite';
    case 'codexQuestion':
      return tool === 'request_user_input' && asks(request, subject.question ?? dialog.title);
    case 'codexAsyncCollapsed':
      return tool === 'request_user_input_async';
    case 'codexAsyncQuestion':
      return tool === 'request_user_input_async' && asks(request, dialog.title);
    case 'ompApproval':
      // A tool without a `Command:` row matches by its name alone.
      if (tool !== subject.toolName) return false;
      return subject.command === null || begins(request.summary, subject.command);
    case 'ompQuestion':
      return tool === 'ask' && asks(request, subject.question ?? dialog.title);
    case 'ompQuestionReview':
      return tool === 'ask';
    case 'grokPermission':
      // A command by its start; an edit or a new file by its name.
      if (subject.command !== null) {
        return tool === 'run_terminal_command' && begins(request.summary, subject.command);
      }
      return (
        ['search_replace', 'write'].includes(tool) && sameFile(request.summary, subject.filePath)
      );
    case 'grokQuestion':
      return tool === 'ask_user_question' && asks(request, subject.question ?? dialog.title);
    case 'openCodePermission':
      return !context.subagentRunning && openCodePermission(request, subject);
    case 'openCodeQuestion':
      return (
        !context.subagentRunning &&
        request.kind === 'question' &&
        asks(request, subject.question ?? dialog.title)
      );
    default:
      return false;
  }
}

/**
 * The action on OpenCode's permission names the call's kind, and its target is the call's file,
 * command or URL. Other actions, such as starting a subagent (`# General Subagent`), match no call,
 * so the card won't reject them: Esc there asks what to do differently.
 */
function openCodePermission(request: ChatPendingRequest, subject: DialogSubject): boolean {
  switch (subject.toolName) {
    case 'Read':
      return request.kind === 'fileRead' && samePath(request.summary, subject.filePath);
    case 'Edit':
    case 'Write':
    case 'Patch':
      return (
        (request.kind === 'fileEdit' || request.kind === 'fileWrite') &&
        samePath(request.summary, subject.filePath)
      );
    case 'Shell':
    case 'Bash':
      return request.kind === 'command' && begins(request.summary, subject.command);
    case 'WebFetch':
      return request.kind === 'web' && begins(request.summary, subject.url);
    default:
      return false;
  }
}

/** The screen's text is the request's, or its start where the dialog was cut off. */
function begins(full: string, shown: string | null): boolean {
  const start = comparable(shown ?? '');
  return start !== '' && comparable(full).startsWith(start);
}

/**
 * The dialog shows the URL Claude Code normalized, which ends a bare host with `/`. A URL the
 * dialog cut off matches the call it starts, but once the screen shows where the host ends, the
 * call's host must be the same: `https://example.com/` never matches `https://example.com.au`.
 */
function sameURL(full: string, shown: string | null): boolean {
  const screen = comparable(shown ?? '');
  const call = comparable(full);
  if (screen === '') return false;
  const screenHost = hostOf(screen, true);
  if (screenHost !== null && hostOf(call, false) !== screenHost) return false;
  const trimmed = (url: string) => (url.endsWith('/') ? url.slice(0, -1) : url);
  return trimmed(call).startsWith(trimmed(screen));
}

/** The scheme and host, up to the first `/`, `?` or `#` after `://`; with `complete`, null when the text ends first. */
function hostOf(url: string, complete: boolean): string | null {
  const scheme = url.indexOf('://');
  if (scheme < 0) return null;
  const end = url.slice(scheme + 3).search(/[/?#]/);
  if (end < 0) return complete ? null : url;
  return url.slice(0, scheme + 3 + end);
}

/** Codex code mode runs a command inside a script, so either text may hold the other. */
function overlaps(full: string, shown: string | null): boolean {
  const screen = comparable(shown ?? '');
  const call = comparable(full);
  return screen !== '' && call !== '' && (call.includes(screen) || screen.includes(call));
}

const lastComponent = (path: string) => path.replace(/\/+$/, '').split('/').at(-1) ?? '';

/** Dialogs name a file relative to the project; calls use full paths. */
function sameFile(path: string, shown: string | null): boolean {
  if (shown === null) return false;
  const name = lastComponent(shown);
  return name !== '' && name === lastComponent(path);
}

/** A whole path, relative to the project for a file inside it; the folders must agree too. */
function samePath(path: string, shown: string | null): boolean {
  const screen = comparable(shown ?? '');
  const call = comparable(path);
  if (screen === '') return false;
  if (screen.startsWith('~/')) return call.endsWith(screen.slice(1));
  return call === screen || call.endsWith(`/${screen}`);
}

function asks(request: ChatPendingRequest, question: string): boolean {
  const shown = comparable(question);
  if (shown === '') return false;
  const asked = [...request.questions.map((q) => q.text), request.summary];
  return asked.some((text) => comparable(text) === shown);
}
