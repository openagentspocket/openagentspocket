// The chat engine. `model` is program-agnostic (Codex, Pi, Grok and OpenCode engines reuse it);
// `claude` is the Claude Code reader.

export type { ClaudeRole } from './claude/chain';
export * from './claude/location';
export * from './claude/locator';
export { CLAUDE_REVISION, ClaudeTranscriptReducer } from './claude/reducer';
export * from './model/agent-directory';
export * from './model/cache';
export * from './model/cache-files';
export * from './model/conversation-reference';
export * from './model/factories';
export * from './model/fake-host-files';
export * from './model/file-cache';
export * from './model/follower';
export * from './model/host-files';
export * from './model/lines';
export * from './model/paths';
export * from './model/preview';
export type { ChatToolOutput, ChatTranscriptReducer } from './model/reducer';
export * from './model/types';
export * from './timeline';
