import type { ChatCacheKey } from '../model/cache';
import type { ConversationReference } from '../model/conversation-reference';
import type { ChatTranscriptAdapter } from './adapter';
import { ChatConversationEngine } from './engine';
import type { ConversationStoreOptions } from './store-types';

export type ConversationEngineRef = ChatConversationEngine & { automaticallyBounded: boolean };

/** The engine for one conversation of the store's Host and herdr session. */
export function createEngine(
  options: ConversationStoreOptions,
  reference: ConversationReference,
  adapter: ChatTranscriptAdapter,
  now: () => number,
): ConversationEngineRef {
  const cacheKey: ChatCacheKey = {
    hostID: options.hostId,
    herdrSession: options.herdrSession,
    program: reference.program,
    conversationID: reference.sessionID,
  };
  const engine = new ChatConversationEngine({
    reference,
    cacheKey,
    files: options.files,
    cache: options.cache,
    adapter,
    accountDirectories: options.accountDirectories,
    now,
  });
  return Object.assign(engine, {
    automaticallyBounded: adapter.limits.automaticOlderSearch != null,
  });
}
