// Edit and write results of Pi and Oh My Pi: numbered diffs, unified patches and written text.

import { describe, expect, it } from 'vitest';
import type { ChatLine } from '../model/lines';
import type { ChatToolActivity } from '../model/types';
import { PiTranscriptReducer } from './reducer';
import { HEADER, lines, project, reduce, text, toolOf, user } from './reducer.testkit';

describe('edit diffs', () => {
  const ompEdit = [
    '{"type":"session","version":3,"id":"01a14045-0053-7439-b93e-c7acce7b7547","timestamp":"2026-10-15T15:53:46.323Z","cwd":"/tmp/heeler-iso-omp2/proj"}',
    '{"type":"message","id":"5a8eaae0","parentId":null,"message":{"role":"user","content":[{"type":"text","text":"change beta"}],"attribution":"user"}}',
    '{"type":"message","id":"c2ed8e36","parentId":"5a8eaae0","message":{"role":"assistant","content":[{"type":"toolCall","id":"call_41|ctc_04","name":"edit","arguments":{"input":"*** Begin Patch\\n[notes.txt#B6C1]\\nPUT 2.=2:\\n+BETA\\n*** End Patch\\n"}}],"stopReason":"toolUse"}}',
    '{"type":"custom","customType":"tool_execution_start","data":{},"id":"7724cd66","parentId":"c2ed8e36"}',
    '{"type":"message","id":"f4717db2","parentId":"7724cd66","message":{"role":"toolResult","toolCallId":"call_41|ctc_04","toolName":"edit","content":[{"type":"text","text":"[notes.txt#F1C1]"}],"details":{"diff":" 1|alpha\\n-2|beta\\n+2|BETA\\n 3|gamma","firstChangedLine":2,"op":"update","path":"/tmp/heeler-iso-omp2/proj/notes.txt"},"isError":false}}',
  ];

  it('turns an OMP numbered diff into file changes and decodes them again', () => {
    const all = lines(ompEdit);
    const reducer = new PiTranscriptReducer('omp');
    reducer.append(all);
    const tool = toolOf(project(reducer)) as ChatToolActivity;
    expect([tool.kind, tool.title]).toEqual(['fileEdit', 'notes.txt']);
    expect(tool.diff).toEqual({ added: 1, removed: 1, files: 1 });
    const changes = tool.fileChanges;
    expect(changes?.directory).toBe('/tmp/heeler-iso-omp2/proj');
    expect(changes?.files[0]?.kind).toBe('updated');
    expect(changes?.files[0]?.hunks).toEqual([
      {
        oldStart: 1,
        oldLines: 3,
        newStart: 1,
        newLines: 3,
        lines: [' alpha', '-beta', '+BETA', ' gamma'],
      },
    ]);
    const expanded = reducer.output(all.at(-1) as ChatLine, tool);
    expect(expanded).toMatchObject({ type: 'preview', fileChanges: changes });
  });

  it('titles a pending edit by its patch header', () => {
    const reducer = new PiTranscriptReducer('omp');
    reducer.append(lines(ompEdit.slice(0, 4)));
    const transcript = project(reducer, 'blocked');
    const tool = toolOf(transcript);
    expect([tool?.status, tool?.title]).toEqual(['awaitingApproval', 'notes.txt']);
    expect(transcript.pendingRequests.map((request) => request.summary)).toEqual(['notes.txt']);
  });

  it('reads an edit under the /tmp alias relative', () => {
    const rows = [...ompEdit];
    rows[0] = (rows[0] as string).replace('"cwd":"/tmp/', '"cwd":"/private/tmp/');
    const tool = toolOf(reduce(rows, 'omp').transcript);
    expect(tool?.title).toBe('notes.txt');
  });

  it('titles an edit of a session-local file by its local path', () => {
    const resolved =
      '/Users/dev/.omp/agent/sessions/-tmp-proj/2026-10-17T20-32-17-663Z_01a14b90/local/append-delta-plan.md';
    const { transcript } = reduce(
      [
        '{"type":"session","version":3,"id":"01a14b90","timestamp":"2026-10-17T20:32:17.663Z","cwd":"/tmp/proj"}',
        user('u', null, [text('Refine the plan')], ',"attribution":"user"'),
        '{"type":"message","id":"a","parentId":"u","message":{"role":"assistant","content":[{"type":"toolCall","id":"c","name":"edit","arguments":{"input":"*** Begin Patch\\n[local://append-delta-plan.md#7A3E]\\nPUT 1.=1:\\n+## Step 1\\n*** End Patch\\n"}}],"stopReason":"toolUse"}}',
        `{"type":"message","id":"r","parentId":"a","message":{"role":"toolResult","toolCallId":"c","toolName":"edit","content":[{"type":"text","text":"x"}],"details":{"diff":"-1|## Step\\n+1|## Step 1","firstChangedLine":1,"op":"update","path":"${resolved}"},"isError":false}}`,
      ],
      'omp',
    );
    const tool = toolOf(transcript);
    expect(tool?.title).toBe('local://append-delta-plan.md');
    expect(tool?.diff).toEqual({ added: 1, removed: 1, files: 1 });
    expect(tool?.fileChanges?.files.map((file) => file.path)).toEqual([resolved]);
  });

  it('turns a Pi unified patch into file changes', () => {
    const all = lines([
      '{"type":"session","version":3,"id":"01a140af-4fae-7475-af1c-10e55f811a43","cwd":"/private/tmp/heeler-iso-pi3/proj"}',
      user('u', null, 'Change beta to BETA in notes.txt'),
      '{"type":"message","id":"a","parentId":"u","message":{"role":"assistant","content":[{"type":"toolCall","id":"call-1|fc_1","name":"edit","arguments":{"path":"notes.txt","edits":[{"oldText":"beta","newText":"BETA"}]}}],"stopReason":"toolUse"}}',
      '{"type":"message","id":"r","parentId":"a","message":{"role":"toolResult","toolCallId":"call-1|fc_1","toolName":"edit","content":[{"type":"text","text":"ok"}],"details":{"diff":" 1 alpha\\n-2 beta\\n+2 BETA\\n 3 gamma","patch":"--- notes.txt\\n+++ notes.txt\\n@@ -1,3 +1,3 @@\\n alpha\\n-beta\\n+BETA\\n gamma\\n","firstChangedLine":2},"isError":false}}',
    ]);
    const reducer = new PiTranscriptReducer();
    reducer.append(all);
    const tool = toolOf(project(reducer)) as ChatToolActivity;
    expect(tool.title).toBe('notes.txt');
    expect(tool.diff).toEqual({ added: 1, removed: 1, files: 1 });
    expect(tool.fileChanges?.files.map((file) => file.path)).toEqual(['notes.txt']);
    expect(tool.fileChanges?.files[0]?.hunks).toEqual([
      {
        oldStart: 1,
        oldLines: 3,
        newStart: 1,
        newLines: 3,
        lines: [' alpha', '-beta', '+BETA', ' gamma'],
      },
    ]);
    expect(reducer.output(all.at(-1) as ChatLine, tool)).toMatchObject({
      fileChanges: tool.fileChanges,
    });
  });

  const write = [
    HEADER,
    user('u', null, 'create todo.txt'),
    '{"type":"message","id":"c","parentId":"u","message":{"role":"assistant","content":[{"type":"toolCall","id":"w1","name":"write","arguments":{"path":"todo.txt","content":"buy milk\\n"}}],"stopReason":"toolUse"}}',
    '{"type":"message","id":"r","parentId":"c","message":{"role":"toolResult","toolCallId":"w1","toolName":"write","content":[{"type":"text","text":"Successfully wrote 9 bytes to todo.txt"}],"details":{"resolvedPath":"/project/todo.txt"},"isError":false}}',
  ];

  it('shows a write as its text, all added, read again from the call', () => {
    const all = lines(write);
    const reducer = new PiTranscriptReducer('omp');
    reducer.append(all);
    const tool = toolOf(project(reducer)) as ChatToolActivity;
    expect([tool.kind, tool.title, tool.status]).toEqual(['fileWrite', 'todo.txt', 'succeeded']);
    expect(tool.diff).toEqual({ added: 1, removed: 0, files: 1 });
    const file = tool.fileChanges?.files[0];
    expect([file?.kind, file?.added]).toEqual(['written', 1]);
    expect(file?.hunks).toEqual([
      { oldStart: 0, oldLines: 0, newStart: 1, newLines: 1, lines: ['+buy milk'] },
    ]);
    const call = all[2] as ChatLine;
    expect(tool.output).toEqual({ path: null, offset: call.offset, length: call.length });
    expect(reducer.output(call, tool)).toEqual({
      type: 'preview',
      preview: null,
      fileChanges: tool.fileChanges,
    });
  });

  it('shows a failed or empty write as its result', () => {
    const failed = [...write];
    failed[3] = (failed[3] as string).replace('"isError":false', '"isError":true');
    const empty = [...write];
    empty[2] = (empty[2] as string).replace('"buy milk\\n"', '""');
    for (const rows of [failed, empty]) {
      const tool = toolOf(reduce(rows, 'omp').transcript);
      expect(tool?.fileChanges).toBeNull();
      expect(tool?.preview?.text).toBe('Successfully wrote 9 bytes to todo.txt');
    }
  });
});
