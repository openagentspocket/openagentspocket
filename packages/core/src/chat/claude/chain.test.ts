// Ported from Swift ClaudeChainResolverTests: compaction relinking, rewinds, damage.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { encodeUtf8 } from '../../events/utf8';
import { frameLines } from '../model/lines';
import { projectionContext } from '../model/types';
import { plainLines } from './prompts';
import { ClaudeTranscriptReducer } from './reducer';

function lines(jsonl: string, options: { lineCap?: number; prefixCap?: number } = {}) {
  return frameLines(encodeUtf8(`${jsonl}\n`), options);
}

function reducerFor(jsonl: string, role: 'main' | 'subagent' = 'main') {
  const reducer = new ClaudeTranscriptReducer(role);
  reducer.append(lines(jsonl));
  return reducer;
}

function ids(jsonl: string): string[] {
  return reducerFor(jsonl)
    .transcript(projectionContext({ activity: 'idle' }))
    .entries.map((entry) => entry.id);
}

const typed = '"promptSource":"typed","origin":{"kind":"human"}';
const user = (uuid: string, parent: string | null, text: string) =>
  `{"type":"user","uuid":"${uuid}","parentUuid":${parent === null ? 'null' : `"${parent}"`},"message":{"role":"user","content":"${text}"},${typed}}`;
const assistant = (uuid: string, parent: string, id: string, text: string) =>
  `{"type":"assistant","uuid":"${uuid}","parentUuid":"${parent}","message":{"id":"${id}","role":"assistant","content":[{"type":"text","text":"${text}"}]},"apiBlockIndex":0}`;
const turnDuration = (uuid: string, parent: string) =>
  `{"type":"system","subtype":"turn_duration","uuid":"${uuid}","parentUuid":"${parent}","durationMs":900}`;

const beforeCompaction = [
  user('p1', null, 'First question'),
  assistant('a1', 'p1', 'm1', 'First answer'),
  turnDuration('t1', 'a1'),
  user('p2', 't1', 'Second question'),
  assistant('a2', 'p2', 'm2', 'Second answer'),
  turnDuration('t2', 'a2'),
].join('\n');

const afterCompaction = [
  '{"type":"user","uuid":"s1","parentUuid":"b1","isCompactSummary":true,"isVisibleInTranscriptOnly":true,"message":{"role":"user","content":"Summary: two questions were answered."}}',
  user('p3', 's1', 'Third question'),
  assistant('a3', 'p3', 'm3', 'Third answer'),
  turnDuration('t3', 'a3'),
].join('\n');

const boundary = (logicalParent: string | null, metadata: string) =>
  `{"type":"system","subtype":"compact_boundary","uuid":"b1","parentUuid":null,${logicalParent === null ? '' : `"logicalParentUuid":"${logicalParent}",`}"content":"Conversation compacted","compactMetadata":${metadata}}`;

const compactedEntries = [
  'user:p1',
  'text:a1',
  'user:p2',
  'text:a2',
  'compact:b1',
  'user:p3',
  'text:a3',
];

describe('compaction', () => {
  const cases = [
    {
      name: 'preserved segment',
      json: boundary(
        't2',
        '{"trigger":"manual","preTokens":5200,"preservedSegment":{"headUuid":"p2","anchorUuid":"s1","tailUuid":"t2"}}',
      ),
      thirdParent: 't2',
    },
    {
      name: 'preserved messages',
      json: boundary(
        't2',
        '{"trigger":"auto","preTokens":5200,"preservedMessages":{"anchorUuid":"s1","uuids":["p2","a2"]}}',
      ),
      thirdParent: 'a2',
    },
    {
      name: 'incomplete preserved messages fall back to the segment',
      json: boundary(
        't2',
        '{"trigger":"auto","preservedMessages":{"anchorUuid":"s1","uuids":["p2","gone"]},"preservedSegment":{"headUuid":"p2","anchorUuid":"s1","tailUuid":"t2"}}',
      ),
      thirdParent: 't2',
    },
    {
      name: 'no logical parent',
      json: boundary(
        null,
        '{"trigger":"manual","preservedSegment":{"headUuid":"p2","anchorUuid":"s1","tailUuid":"t2"}}',
      ),
      thirdParent: 't2',
    },
  ];

  for (const { name, json, thirdParent } of cases) {
    it(`relinks ${name} and keeps the history above it`, () => {
      const reducer = reducerFor([beforeCompaction, json, afterCompaction].join('\n'));
      const chain = reducer.chain(projectionContext());
      expect(chain.parents.get('p2')).toBe('s1');
      expect(chain.parents.get('p3')).toBe(thirdParent);
      expect(chain.leafUUID).toBe('a3');
      expect(chain.records).toHaveLength(11);
      const transcript = reducer.transcript(projectionContext({ activity: 'idle' }));
      expect(transcript.entries.map((entry) => entry.id)).toEqual(compactedEntries);
      const divider = transcript.entries.find((entry) => entry.id === 'compact:b1')?.content;
      expect(divider).toEqual({
        type: 'divider',
        value: { kind: 'compaction', detail: 'Summary: two questions were answered.' },
      });
    });
  }

  it('follows the boundary logical parent, not an abandoned branch', () => {
    const jsonl = [
      user('p1', null, 'First question'),
      assistant('a1', 'p1', 'm1', 'First answer'),
      turnDuration('t1', 'a1'),
      user('p2', 't1', 'Abandoned question'),
      assistant('a2', 'p2', 'm2', 'Abandoned answer'),
      turnDuration('t2', 'a2'),
      user('p2b', 't1', 'Edited question'),
      assistant('a2b', 'p2b', 'm2b', 'Edited answer'),
      turnDuration('t2b', 'a2b'),
      boundary(
        't2b',
        '{"trigger":"manual","preservedSegment":{"headUuid":"p2b","anchorUuid":"s1","tailUuid":"t2b"}}',
      ),
      '{"type":"user","uuid":"s1","parentUuid":"b1","isCompactSummary":true,"isVisibleInTranscriptOnly":true,"message":{"role":"user","content":"Summary"}}',
      user('p3', 's1', 'Third question'),
      assistant('a3', 'p3', 'm3', 'Third answer'),
    ].join('\n');
    expect(ids(jsonl)).toEqual([
      'user:p1',
      'text:a1',
      'user:p2b',
      'text:a2b',
      'compact:b1',
      'user:p3',
      'text:a3',
    ]);
  });

  const namingTail = (metadata: string) =>
    [
      user('p1', null, 'First question'),
      assistant('a1', 'p1', 'm1', 'First answer'),
      turnDuration('t1', 'a1'),
      user('p2', 't1', 'Second question'),
      assistant('a2', 'p2', 'm2', 'Second answer'),
      boundary('x1', metadata),
      '{"type":"user","uuid":"s1","parentUuid":"b1","isCompactSummary":true,"isVisibleInTranscriptOnly":true,"message":{"role":"user","content":"Summary"}}',
      '{"type":"attachment","uuid":"x1","parentUuid":"s1","attachment":{"type":"skill_listing"}}',
      user('p3', 'x1', 'Third question'),
      assistant('a3', 'p3', 'm3', 'Third answer'),
    ].join('\n');

  it('keeps the history above a boundary that names its preserved tail written after it', () => {
    const metadata =
      '{"trigger":"auto","preservedMessages":{"anchorUuid":"s1","uuids":["p2","a2","x1"]},"preservedSegment":{"headUuid":"p2","anchorUuid":"s1","tailUuid":"x1"}}';
    expect(ids(namingTail(metadata))).toEqual(compactedEntries);
  });

  it('with only the segment form, what lies between head and tail stays off the branch', () => {
    const metadata =
      '{"trigger":"auto","preservedSegment":{"headUuid":"p2","anchorUuid":"s1","tailUuid":"x1"}}';
    expect(ids(namingTail(metadata))).toEqual([
      'user:p1',
      'text:a1',
      'user:p2',
      'compact:b1',
      'user:p3',
      'text:a3',
    ]);
  });
});

describe('branches and damage', () => {
  it('a rewind hides the old branch; its prompt stays recorded without an entry', () => {
    const jsonl = [
      user('p1', null, 'First question'),
      assistant('a1', 'p1', 'm1', 'First answer'),
      turnDuration('t1', 'a1'),
      user('p2', 't1', 'Original question'),
      assistant('a2', 'p2', 'm2', 'Original answer'),
      turnDuration('t2', 'a2'),
      user('p2b', 't1', 'Edited question'),
      assistant('a2b', 'p2b', 'm2b', 'Edited answer'),
    ].join('\n');
    const transcript = reducerFor(jsonl).transcript(projectionContext({ activity: 'idle' }));
    expect(transcript.entries.map((entry) => entry.id)).toEqual([
      'user:p1',
      'text:a1',
      'user:p2b',
      'text:a2b',
    ]);
    expect(transcript.recordedPrompts.map((prompt) => prompt.text)).toEqual([
      'First question',
      'Original question',
      'Edited question',
    ]);
    expect(transcript.recordedPrompts.map((prompt) => prompt.entryID)).toEqual([
      'user:p1',
      null,
      'user:p2b',
    ]);
  });

  it('of two records for one block, the walked one stays', () => {
    const jsonl = [
      user('p1', null, 'Hi'),
      assistant('d1', 'p1', 'm1', 'Draft'),
      assistant('d2', 'p1', 'm1', 'Final'),
      turnDuration('t1', 'd2'),
    ].join('\n');
    expect(ids(jsonl)).toEqual(['user:p1', 'text:d2']);
  });

  it('a parent cycle ends the walk instead of looping', () => {
    const jsonl = [
      '{"type":"user","uuid":"x2","parentUuid":"x3","message":{"role":"user","content":"two"},"promptSource":"typed"}',
      '{"type":"user","uuid":"x3","parentUuid":"x2","message":{"role":"user","content":"three"},"promptSource":"typed"}',
      assistant('x1', 'x2', 'm1', 'one'),
    ].join('\n');
    const chain = reducerFor(jsonl).chain(projectionContext());
    expect(chain.leafUUID).toBe('x1');
    expect(new Set(chain.records.map((record) => record.uuid))).toEqual(
      new Set(['x1', 'x2', 'x3']),
    );
  });

  it('with the head loaded, the walk bridges an unreadable line; in a window it asks for older history', () => {
    const jsonl = [
      user('p1', null, 'Dump the log'),
      '{"type":"assistant","uuid":"a1","parentUuid":"p1","message":{"id":"m1","role":"assistant","content":[{"type":"tool_use","id":"toolu_big","name":"Bash","input":{"command":"cat big.log"}}]},"apiBlockIndex":0}',
      `{"type":"user","uuid":"r1","parentUuid":"a1","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_big","content":"${'x'.repeat(600)}"}]}}`,
      assistant('a2', 'r1', 'm2', 'The log is long.'),
      turnDuration('t1', 'a2'),
    ].join('\n');
    const reducer = new ClaudeTranscriptReducer();
    const framed = lines(jsonl, { lineCap: 400, prefixCap: 64 });
    expect(framed.filter((line) => line.data.length < line.length)).toHaveLength(1);
    reducer.append(framed);
    const whole = reducer.chain(projectionContext());
    expect(whole.missingParent).toBe('r1');
    expect(whole.records.map((record) => record.uuid)).toEqual(['p1', 'a1', 'a2', 't1']);
    const transcript = reducer.transcript(projectionContext({ activity: 'idle' }));
    expect(transcript.entries.map((entry) => entry.id)).toEqual([
      'user:p1',
      'tool:toolu_big',
      'text:a2',
    ]);
    const row = transcript.entries[1]?.content;
    expect(row?.type === 'tool' && row.value.status).toBe('noResult');
    expect(transcript.diagnostics.oversizedLines).toBe(1);
    const window = reducer.transcript(projectionContext({ windowStart: 1, activity: 'idle' }));
    expect(window.entries.map((entry) => entry.id)).toEqual(['text:a2']);
    expect(window.needsOlderHistory).toBe(true);
  });
});

describe('probe transcript', () => {
  const directory = join(__dirname, '../../../goldens/claude/transcripts');
  const all = frameLines(new Uint8Array(readFileSync(join(directory, 'probe2-transcript.jsonl'))));

  it('the leaf is the newest message and every record is on the branch in file order', () => {
    const reducer = new ClaudeTranscriptReducer();
    reducer.append(all);
    const chain = reducer.chain(projectionContext());
    expect(chain.leafUUID).toBe('fb1b2513-838c-477a-bf91-3660ff9e7d84');
    expect(chain.missingParent).toBeNull();
    expect(chain.records).toHaveLength(119);
    expect(
      chain.records.every(
        (record, i) => i === 0 || (chain.records[i - 1]?.byteOffset ?? 0) < record.byteOffset,
      ),
    ).toBe(true);
  });

  it('a tail window reports the missing parent; prepending the rest converges on the whole chain', () => {
    const cut = 58245;
    const reducer = new ClaudeTranscriptReducer();
    reducer.append(all.filter((line) => line.offset >= cut));
    const window = reducer.chain(projectionContext({ windowStart: cut }));
    expect(window.missingParent).toBe('bad3c1b6-dd8f-409c-aa1d-1dbe1c2fb1fa');
    expect(window.records[0]?.uuid).toBe('d26638ad-4d4a-4f14-aaa1-9efe8d823dfd');
    reducer.prepend(all.filter((line) => line.offset < cut));
    const whole = new ClaudeTranscriptReducer();
    whole.append(all);
    expect(reducer.chain(projectionContext()).records.map((r) => r.uuid)).toEqual(
      whole.chain(projectionContext()).records.map((r) => r.uuid),
    );
  });

  it('a subagent file is one linear chain read only by the subagent role', () => {
    const sub = frameLines(new Uint8Array(readFileSync(join(directory, 'probe2-subagent.jsonl'))));
    const subagent = new ClaudeTranscriptReducer('subagent');
    subagent.append(sub);
    const chain = subagent.chain(projectionContext());
    expect(chain.records).toHaveLength(19);
    expect(
      chain.records.every(
        (record, i) => i === 0 || record.parentUUID === chain.records[i - 1]?.uuid,
      ),
    ).toBe(true);
    const main = new ClaudeTranscriptReducer();
    main.append(sub);
    expect(main.transcript(projectionContext()).entries).toEqual([]);
  });
});

describe('compaction preview (plainLines vs Swift ChatMarkdown.plainText)', () => {
  // Cases where the Swift ChatMarkdownTests.plainText expectation and the port agree.
  it('drops heading marks and blank lines like Swift plainText', () => {
    expect(plainLines('## Goal\n\nTried another fix')).toBe('Goal\nTried another fix');
    expect(plainLines('Tried another fix')).toBe('Tried another fix');
  });

  // Known divergence: Swift also strips inline marks, task boxes, HTML blocks and thematic breaks.
  it('keeps inline marks, task boxes and HTML (documented divergence)', () => {
    expect(plainLines('- [x] done')).toBe('- [x] done');
    expect(plainLines('**Turn** `x`')).toBe('**Turn** `x`');
  });
});
