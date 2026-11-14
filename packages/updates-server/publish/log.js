// The public log of published updates: docs/releases/updates.jsonl, one JSON object per line,
// appended by the upload step and committed by the owner.
//
// Why a file in the repository and not one the Worker serves: the server is the party the log must
// hold to account, and a file it serves is a file it can rewrite. Git history on the public repo is
// outside the Worker's and the Cloudflare account's reach, and each entry carries the manifest's
// SHA-256 and its signature, so anyone can check what the server serves against the log and the
// committed certificate, and rebuild the update from the logged commit.
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const LOG_FILE = join('docs', 'releases', 'updates.jsonl');

/**
 * @typedef {{kind: 'manifest' | 'directive', id: string, platform: string, runtimeVersion: string,
 *   createdAt: string, commit: string, bodySha256: string, signature: string,
 *   channel?: string, uploadedAt?: string}} LogEntry
 */

/** @returns {LogEntry[]} */
export function readLog(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line, i) => {
      try {
        return JSON.parse(line);
      } catch {
        throw new Error(`${file}:${i + 1} is not JSON`);
      }
    });
}

export function appendLog(file, entry) {
  if (!entry.channel || !entry.uploadedAt)
    throw new Error('a log entry needs channel and uploadedAt');
  appendFileSync(file, `${JSON.stringify(entry)}\n`);
}

/**
 * What a new update must be newer than: the entries for the same platform and runtime version, on
 * the given channel, or on any channel when none is given.
 */
export function previousEntries(entries, { platform, runtimeVersion, channel }) {
  return entries.filter(
    (e) =>
      e.platform === platform &&
      e.runtimeVersion === runtimeVersion &&
      (channel === undefined || e.channel === channel),
  );
}
