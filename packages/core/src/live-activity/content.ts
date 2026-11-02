import type { RandomBytes } from '../notifications/key-store';
import { sealActivity } from './envelope';
import type { ActivityContentState, ActivityDesire } from './types';

/** Base64url `ct` budget so the full APNs payload stays under 4096 bytes. */
export const MAX_CIPHERTEXT_CHARS = 2800;
const NONCE_BYTES = 12;

function mapAgents(
  desire: ActivityDesire,
  strip: (agent: ActivityDesire['agents'][number]) => ActivityDesire['agents'][number],
): ActivityDesire {
  return { ...desire, agents: desire.agents.map(strip) };
}

function sameAgents(a: ActivityDesire, b: ActivityDesire): boolean {
  return JSON.stringify(a.agents) === JSON.stringify(b.agents);
}

/** Degrades in contract order: drop prompts, then titles and names, then empty `agents`. */
function candidates(desire: ActivityDesire): ActivityDesire[] {
  const list = [desire];
  const withoutAsks = mapAgents(desire, ({ ask: _ask, ...agent }) => agent);
  if (!sameAgents(withoutAsks, desire)) list.push(withoutAsks);
  const withoutTitles = mapAgents(withoutAsks, ({ title: _t, name: _n, ...agent }) => agent);
  if (!sameAgents(withoutTitles, withoutAsks)) list.push(withoutTitles);
  list.push({ ...desire, agents: [] });
  return list;
}

/**
 * Seals `desire` under the Host's Notification Key into the content state the activity shows.
 * Returns null only when sealing itself fails (a key of the wrong size).
 */
export function sealContent(
  desire: ActivityDesire,
  key: Uint8Array,
  randomBytes: RandomBytes,
  nonce?: Uint8Array,
): ActivityContentState | null {
  for (const candidate of candidates(desire)) {
    try {
      const envelope = sealActivity(candidate, key, nonce ?? randomBytes(NONCE_BYTES));
      if (envelope.ct.length <= MAX_CIPHERTEXT_CHARS || candidate.agents.length === 0) {
        return { counts: desire.counts, envelope };
      }
    } catch {
      return null;
    }
  }
  return null;
}
