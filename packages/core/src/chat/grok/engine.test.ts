// The Grok Build wiring through the shared engine: the locator finds the session's file, the
// adapter reads it, and rewrites of the tail never join cached history.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { standardAdapter } from '../engine/adapter';
import { ChatConversationEngine } from '../engine/engine';
import { IDLE } from '../engine/fixtures.testkit';
import { VolatileChatTranscriptCache } from '../model/cache';
import { FakeHostFiles } from '../model/fake-host-files';

const SESSION = '01900000-0000-7000-8000-000000000004';
const CWD = '/home/dev/proj';

function engineFor(files: FakeHostFiles, sessionID = SESSION) {
  const adapter = standardAdapter('grok');
  if (!adapter) throw new Error('no Grok adapter');
  return new ChatConversationEngine({
    reference: { program: 'grok', sessionID },
    cacheKey: { hostID: 'h1', herdrSession: '', program: 'grok', conversationID: sessionID },
    files,
    cache: new VolatileChatTranscriptCache(),
    adapter,
  });
}

const fixture = (name: string) =>
  new Uint8Array(readFileSync(join(__dirname, '../../../goldens/grok/transcripts', name)));

describe('Grok Build conversation engine', () => {
  it('locates the transcript by its session id and shows its entries', async () => {
    const files = new FakeHostFiles();
    files.homePath = '/home/dev';
    const path = `/home/dev/.grok/sessions/%2Fhome%2Fdev%2Fproj/${SESSION}/updates.jsonl`;
    files.write(path, fixture('pending-permission.jsonl'));
    const snapshot = await engineFor(files).open([CWD], IDLE);
    expect(snapshot.phase).toEqual({ type: 'following', path });
    expect(snapshot.transcript.entries.length).toBeGreaterThan(0);
    expect(snapshot.transcript.diagnostics.invalidLines).toBe(0);
  });

  it('says why when no group holds the session', async () => {
    const files = new FakeHostFiles();
    files.homePath = '/home/dev';
    files.mkdir('/home/dev/.grok/sessions');
    const snapshot = await engineFor(files).open([CWD], IDLE);
    expect(snapshot.phase).toMatchObject({
      type: 'unavailable',
      reason: { kind: 'notFound', searchedAll: true },
    });
  });

  it('rejects a folder that holds another session', async () => {
    const files = new FakeHostFiles();
    files.homePath = '/home/dev';
    const path = `/home/dev/.grok/sessions/%2Fhome%2Fdev%2Fproj/${SESSION}/updates.jsonl`;
    files.write(path, fixture('fork-head.jsonl'));
    // fork-head.jsonl belongs to session ...0002.
    const snapshot = await engineFor(files).open([CWD], IDLE);
    expect(snapshot.phase).toMatchObject({ type: 'unavailable', reason: { kind: 'mismatched' } });
  });
});
