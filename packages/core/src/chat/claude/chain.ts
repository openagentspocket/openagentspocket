// Picks the current branch of the record tree (Swift ClaudeChainResolver): the newest leaf that
// reaches a user or assistant message, walked up through compactions, with sibling recovery.

import type { ClaudeTranscriptIndex } from './index-store';
import {
  type ClaudeRecord,
  isAttachment,
  isSystem,
  isUserOrAssistant,
  toolResultsOf,
  toolUsesOf,
} from './record-types';

export type ClaudeRole = 'main' | 'subagent';

export interface ClaudeChain {
  records: ClaudeRecord[];
  leafUUID: string | null;
  terminalUUID: string | null;
  missingParent: string | null;
  parents: Map<string, string>;
}

export function resolveChain(
  index: ClaudeTranscriptIndex,
  role: ClaudeRole,
  bridgesMissingParents: boolean,
): ClaudeChain {
  const ordered = index.recordsByPosition;
  const chain: ClaudeChain = {
    records: [],
    leafUUID: null,
    terminalUUID: null,
    missingParent: null,
    parents: new Map(),
  };
  if (ordered.length === 0) return chain;
  const records = index.records;
  const rank = new Map<string, number>();
  ordered.forEach((record, position) => {
    rank.set(record.uuid, position);
  });
  const parents = new Map<string, string>();
  for (const record of ordered)
    if (record.parentUUID !== null) parents.set(record.uuid, record.parentUUID);
  relinkCompactions(ordered, records, parents);
  chain.parents = parents;

  const isEligible = (record: ClaudeRecord): boolean => {
    const kind = record.kind;
    if (kind.type === 'progress' || kind.type === 'unknown') return false;
    if (isAttachment(record, 'fork_briefing')) return false;
    return role === 'subagent' || (!record.isSidechain && record.teamName === null);
  };
  const parentsOfEligible = new Set<string>();
  for (const record of ordered) {
    const parent = parents.get(record.uuid);
    if (isEligible(record) && parent !== undefined) parentsOfEligible.add(parent);
  }
  const terminals = [...ordered]
    .reverse()
    .filter((r) => isEligible(r) && !parentsOfEligible.has(r.uuid));

  const firstMessage = (
    start: ClaudeRecord,
    excluded: ReadonlySet<string>,
    claimed: Set<string>,
  ): ClaudeRecord | null => {
    const walked: string[] = [];
    const visited = new Set<string>();
    let current: ClaudeRecord | undefined = start;
    while (
      current &&
      !claimed.has(current.uuid) &&
      !excluded.has(current.uuid) &&
      !visited.has(current.uuid)
    ) {
      visited.add(current.uuid);
      if (isUserOrAssistant(current)) return current;
      walked.push(current.uuid);
      const parent = parents.get(current.uuid);
      current = parent === undefined ? undefined : records.get(parent);
    }
    for (const uuid of walked) claimed.add(uuid);
    return null;
  };

  const claimed = new Set<string>();
  let terminal: ClaudeRecord | null = null;
  for (const candidate of terminals) {
    const leaf = firstMessage(candidate, new Set(), claimed);
    if (leaf) {
      chain.leafUUID = leaf.uuid;
      terminal = candidate;
      break;
    }
  }
  if (!terminal) {
    const leaf = fallbackLeaf(ordered, records, parents, rank, role);
    if (leaf) {
      chain.leafUUID = leaf.uuid;
      terminal = leaf;
    }
  }
  if (!terminal) return chain;
  chain.terminalUUID = terminal.uuid;

  const selected = new Set<string>();
  const expandedBoundaries = new Set<string>();
  const segmentTerminal = (before: ClaudeRecord): ClaudeRecord | null => {
    const limit = rank.get(before.uuid);
    if (limit === undefined) return null;
    const localClaimed = new Set<string>();
    for (const candidate of terminals) {
      if (
        (rank.get(candidate.uuid) ?? Number.MAX_SAFE_INTEGER) < limit &&
        !selected.has(candidate.uuid)
      ) {
        if (firstMessage(candidate, selected, localClaimed)) return candidate;
      }
    }
    return null;
  };
  const olderSegment = (boundary: ClaudeRecord): ClaudeRecord | null => {
    if (expandedBoundaries.has(boundary.uuid)) return null;
    expandedBoundaries.add(boundary.uuid);
    const limit = rank.get(boundary.uuid);
    if (limit === undefined) return null;
    const beforeBoundary = (uuid: string): ClaudeRecord | null => {
      const position = rank.get(uuid);
      return position !== undefined && position < limit ? (records.get(uuid) ?? null) : null;
    };
    const logicalParent = boundary.system?.logicalParentUUID ?? null;
    if (logicalParent !== null) {
      const record = beforeBoundary(logicalParent);
      if (record) return record;
      if (!records.has(logicalParent)) {
        if (chain.missingParent === null) chain.missingParent = logicalParent;
        if (!bridgesMissingParents) return null;
      }
    }
    const compaction = boundary.system?.compaction ?? null;
    let preserved: ClaudeRecord | null = null;
    for (const uuid of [...(compaction?.preservedMessages?.uuids ?? [])].reverse()) {
      preserved = beforeBoundary(uuid);
      if (preserved) break;
    }
    preserved ??= compaction?.preservedSegment
      ? beforeBoundary(compaction.preservedSegment.headUUID)
      : null;
    return preserved ?? segmentTerminal(boundary);
  };

  // The first segment follows relinked parents, so it runs through the messages a compaction
  // preserved. Older segments follow the parents as written.
  let segment: { start: ClaudeRecord; followsWrittenParents: boolean } | null = {
    start: terminal,
    followsWrittenParents: false,
  };
  while (segment) {
    const { start, followsWrittenParents } = segment;
    segment = null;
    let current: ClaudeRecord = start;
    const walked = new Set<string>();
    while (!walked.has(current.uuid)) {
      walked.add(current.uuid);
      selected.add(current.uuid);
      const parentID: string | null | undefined = followsWrittenParents
        ? current.parentUUID
        : parents.get(current.uuid);
      if (parentID === null || parentID === undefined) {
        if (isSystem(current, 'compact_boundary')) {
          const older = olderSegment(current);
          if (older) segment = { start: older, followsWrittenParents: true };
        }
        break;
      }
      const parent = records.get(parentID);
      if (!parent) {
        if (chain.missingParent === null) chain.missingParent = parentID;
        if (bridgesMissingParents) {
          const older = segmentTerminal(current);
          if (older) segment = { start: older, followsWrittenParents: true };
        }
        break;
      }
      current = parent;
    }
  }
  const walkedAll = new Set(selected);
  recoverSiblings(ordered, walkedAll, selected);
  dropDuplicateBlocks(ordered, walkedAll, selected);
  dropRetractedMessages(ordered, selected);
  chain.records = ordered.filter((record) => selected.has(record.uuid));
  return chain;
}

function relinkCompactions(
  ordered: ClaudeRecord[],
  records: Map<string, ClaudeRecord>,
  parents: Map<string, string>,
): void {
  const children = new Map<string, Set<string>>();
  const link = (child: string, parent: string) => {
    const set = children.get(parent) ?? new Set<string>();
    children.set(parent, set);
    set.add(child);
  };
  for (const [child, parent] of parents) link(child, parent);
  const reparent = (child: string, parent: string) => {
    const old = parents.get(child);
    if (old !== undefined) children.get(old)?.delete(child);
    parents.set(child, parent);
    link(child, parent);
  };
  for (const boundary of ordered) {
    if (!isSystem(boundary, 'compact_boundary')) continue;
    const compaction = boundary.system?.compaction;
    if (!compaction) continue;
    const preserved = compaction.preservedMessages;
    const segment = compaction.preservedSegment;
    if (
      preserved &&
      preserved.uuids.length > 0 &&
      records.has(preserved.anchorUUID) &&
      !preserved.uuids.includes(preserved.anchorUUID) &&
      preserved.uuids.every((uuid) => records.has(uuid))
    ) {
      const first = preserved.uuids[0] as string;
      const last = preserved.uuids[preserved.uuids.length - 1] as string;
      let previous = preserved.anchorUUID;
      for (const uuid of preserved.uuids) {
        reparent(uuid, previous);
        previous = uuid;
      }
      for (const child of [...(children.get(preserved.anchorUUID) ?? [])]) {
        if (child !== first) reparent(child, last);
      }
    } else if (
      segment &&
      records.has(segment.headUUID) &&
      records.has(segment.anchorUUID) &&
      records.has(segment.tailUUID) &&
      segment.headUUID !== segment.anchorUUID
    ) {
      reparent(segment.headUUID, segment.anchorUUID);
      // 2.1.291 writes the tail after the boundary, under the anchor.
      for (const child of [...(children.get(segment.anchorUUID) ?? [])]) {
        if (child !== segment.headUUID && child !== segment.tailUUID)
          reparent(child, segment.tailUUID);
      }
    }
  }
}

function fallbackLeaf(
  ordered: ClaudeRecord[],
  records: Map<string, ClaudeRecord>,
  parents: Map<string, string>,
  rank: Map<string, number>,
  role: ClaudeRole,
): ClaudeRecord | null {
  const parentIDs = new Set(parents.values());
  const hits: ClaudeRecord[] = [];
  for (const record of ordered) {
    if (parentIDs.has(record.uuid)) continue;
    const visited = new Set<string>();
    let current: ClaudeRecord | undefined = record;
    while (current && !visited.has(current.uuid)) {
      visited.add(current.uuid);
      if (isUserOrAssistant(current)) {
        hits.push(current);
        break;
      }
      const parent = parents.get(current.uuid);
      current = parent === undefined ? undefined : records.get(parent);
    }
  }
  const preferred = hits.filter(
    (r) => !r.isMeta && (role === 'subagent' || (!r.isSidechain && r.teamName === null)),
  );
  const pool = preferred.length > 0 ? preferred : hits;
  let best: ClaudeRecord | null = null;
  for (const hit of pool) {
    if (!best || (rank.get(hit.uuid) ?? -1) > (rank.get(best.uuid) ?? -1)) best = hit;
  }
  return best;
}

function recoverSiblings(
  ordered: ClaudeRecord[],
  walked: ReadonlySet<string>,
  selected: Set<string>,
): void {
  const sameScope = (a: ClaudeRecord, b: ClaudeRecord) =>
    a.isSidechain === b.isSidechain && a.agentID === b.agentID;
  const groups = new Map<string, ClaudeRecord[]>();
  const results = new Map<string, ClaudeRecord[]>();
  const push = (map: Map<string, ClaudeRecord[]>, key: string, record: ClaudeRecord) => {
    const list = map.get(key);
    if (list) list.push(record);
    else map.set(key, [record]);
  };
  for (const record of ordered) {
    if (record.kind.type === 'assistant' && record.messageID !== null)
      push(groups, record.messageID, record);
    for (const result of toolResultsOf(record)) push(results, result.toolUseID, record);
  }
  const seeds: { messageID: string; scope: ClaudeRecord }[] = [];
  for (const record of ordered) {
    if (!walked.has(record.uuid)) continue;
    if (record.kind.type === 'assistant' && record.messageID !== null)
      seeds.push({ messageID: record.messageID, scope: record });
    if (record.interruptedMessageID !== null)
      seeds.push({ messageID: record.interruptedMessageID, scope: record });
  }
  for (const seed of seeds) {
    for (const sibling of groups.get(seed.messageID) ?? []) {
      if (sameScope(sibling, seed.scope)) selected.add(sibling.uuid);
    }
  }
  const answered = new Set<string>();
  for (const record of ordered) {
    if (selected.has(record.uuid))
      for (const result of toolResultsOf(record)) answered.add(result.toolUseID);
  }
  for (const record of ordered) {
    if (!selected.has(record.uuid)) continue;
    for (const use of toolUsesOf(record)) {
      if (answered.has(use.id)) continue;
      const candidates = results.get(use.id) ?? [];
      let found: ClaudeRecord | undefined;
      for (let i = candidates.length - 1; i >= 0; i -= 1) {
        const candidate = candidates[i] as ClaudeRecord;
        if (!selected.has(candidate.uuid) && sameScope(candidate, record)) {
          found = candidate;
          break;
        }
      }
      if (!found) continue;
      selected.add(found.uuid);
      answered.add(use.id);
    }
  }
}

function dropDuplicateBlocks(
  ordered: ClaudeRecord[],
  walked: ReadonlySet<string>,
  selected: Set<string>,
): void {
  const keep = new Map<string, ClaudeRecord>();
  const duplicated = new Set<string>();
  const keyOf = (record: ClaudeRecord): string | null =>
    record.messageID !== null && record.apiBlockIndex !== null
      ? `${record.messageID}\u0000${record.apiBlockIndex}`
      : null;
  for (const record of ordered) {
    if (!selected.has(record.uuid)) continue;
    const key = keyOf(record);
    if (key === null) continue;
    const kept = keep.get(key);
    if (!kept) {
      keep.set(key, record);
      continue;
    }
    duplicated.add(key);
    // `ordered` runs oldest first: a later record wins unless only the kept one was walked.
    if (walked.has(record.uuid) || !walked.has(kept.uuid)) keep.set(key, record);
  }
  if (duplicated.size === 0) return;
  for (const record of ordered) {
    if (!selected.has(record.uuid)) continue;
    const key = keyOf(record);
    if (key !== null && duplicated.has(key) && keep.get(key)?.uuid !== record.uuid)
      selected.delete(record.uuid);
  }
}

function dropRetractedMessages(ordered: ClaudeRecord[], selected: Set<string>): void {
  for (const record of ordered) {
    if (!selected.has(record.uuid)) continue;
    for (const uuid of record.system?.retractedMessageUUIDs ?? []) selected.delete(uuid);
  }
}
