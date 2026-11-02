// Ported from Swift ChatTimelineProjectionTests (summaries, display paths).

import { describe, expect, it } from 'vitest';
import { renderText } from '../../errors/text';
import { toolActivity } from '../model/factories';
import type { ChatFileChange, ChatToolActivity, ToolKind } from '../model/types';
import { fileChange, fileChanges } from './helpers.test-util';
import { displayFilePath, summaryOfTools } from './summary';

const summary = (tools: ChatToolActivity[]) => renderText(summaryOfTools(tools));

function tool(kind: ToolKind, name = 'T', title = 't', extra: Partial<ChatToolActivity> = {}) {
  return toolActivity({ kind, name, title, status: 'succeeded', ...extra });
}
const withFiles = (kind: ToolKind, files: ChatFileChange[], extra = {}, title = 't') =>
  tool(kind, 'T', title, { fileChanges: fileChanges(files, extra) });
const stats = (files: number) => ({ added: 2, removed: 0, files });

describe('summaryOfTools', () => {
  it('names what the calls did, in a fixed order', () => {
    expect(summary([tool('command'), tool('command')])).toBe('Ran 2 commands');
    expect(
      summary([tool('fileRead', 'T', 'a'), tool('fileRead', 'T', 'a'), tool('fileRead', 'T', 'b')]),
    ).toBe('Read 2 files');
    expect(summary([tool('fileWrite', 'T', 'a')])).toBe('Created 1 file');
    expect(summary([tool('search'), tool('search')])).toBe('Ran 2 searches');
    expect(summary([tool('command'), tool('listing')])).toBe('Ran 1 command, Listed 1 folder');
    expect(summary([tool('search'), tool('listing'), tool('listing')])).toBe(
      'Ran 1 search, Listed 2 folders',
    );
    expect(
      summary([tool('web', 'WebSearch'), tool('web', 'WebFetch'), tool('web', 'WebFetch')]),
    ).toBe('Searched the web once, Fetched 2 pages');
    expect(summary([tool('web', 'browse'), tool('web', 'browse')])).toBe('Used the web 2 times');
    expect(summary([tool('mcp'), tool('image'), tool('todo'), tool('todo')])).toBe(
      'Called 1 tool, 1 image, Updated the to-do list',
    );
    expect(summary([tool('command'), tool('image'), tool('image')])).toBe(
      'Ran 1 command, 2 images',
    );
    expect(summary([tool('other'), tool('other')])).toBe('Used 2 tools');
    expect(summary([tool('command'), tool('other')])).toBe('Ran 1 command, 1 other tool');
  });

  it('counts files from the lists, the extras and the titles', () => {
    const edit = withFiles('fileEdit', [fileChange('a'), fileChange('b')], { moreFiles: 3 });
    const again = withFiles('fileEdit', [fileChange('a')]);
    expect(summary([edit, again])).toBe('Edited 5 files');

    const created = withFiles('fileWrite', [fileChange('new', 'created')]);
    const overwritten = withFiles('fileWrite', [fileChange('old', 'updated')]);
    expect(summary([created, overwritten])).toBe('Edited 1 file, Created 1 file');

    // A write that can't tell a new file from an old one wrote it.
    const written = withFiles('fileWrite', [fileChange('todo.txt', 'written')]);
    expect(summary([written])).toBe('Wrote 1 file');
    expect(summary([overwritten, created, written])).toBe(
      'Edited 1 file, Created 1 file, Wrote 1 file',
    );
  });

  it('counts a failed edit and its retry as one file', () => {
    const failed = tool('fileEdit', 'T', 'c.txt');
    const retried = withFiles(
      'fileEdit',
      [fileChange('/private/tmp/p/c.txt')],
      { directory: '/tmp/p' },
      'c.txt',
    );
    expect(summary([failed, retried])).toBe('Edited 1 file');
  });

  it('counts a Codex patch row by its diff', () => {
    const patch = tool('fileEdit', 'T', 'new.txt, notes.txt', { diff: stats(2) });
    expect(summary([patch])).toBe('Edited 2 files');
    expect(summary([patch, patch])).toBe('Edited 2 files');
    const adds = tool('fileWrite', 'T', 'a.txt, b.txt', { diff: stats(2) });
    expect(summary([adds, patch])).toBe('Edited 2 files, Created 2 files');
  });

  it('counts a file changed twice once, under its first change', () => {
    const change = (kind: ToolKind, path: string, how: ChatFileChange['kind']) =>
      tool(kind, 'T', path, { fileChanges: fileChanges([fileChange(path, how)]) });
    const create = change('fileWrite', 'v4.txt', 'created');
    const edit = change('fileEdit', 'v4.txt', 'updated');
    const other = change('fileEdit', 'w.txt', 'updated');
    expect(summary([create, edit])).toBe('Created 1 file');
    expect(summary([edit, create])).toBe('Edited 1 file');
    expect(summary([create, edit, other])).toBe('Edited 1 file, Created 1 file');
    expect(summary([change('fileWrite', 'v4.txt', 'written'), edit])).toBe('Wrote 1 file');
    expect(summary([tool('fileRead', 'Read', 'v4.txt'), edit])).toBe('Edited 1 file, Read 1 file');

    const adds = tool('fileWrite', 'T', 'a.txt, b.txt', { diff: stats(2) });
    const patch = tool('fileEdit', 'T', 'a.txt, b.txt', {
      diff: { added: 1, removed: 1, files: 2 },
    });
    expect(summary([adds, patch])).toBe('Created 2 files');
  });

  it('is a catalog message, so the UI translates it', () => {
    expect(summaryOfTools([tool('command')]).join[0]).toEqual({ key: 'Ran 1 command' });
  });
});

describe('displayFilePath', () => {
  it('is relative inside the directory and as recorded outside', () => {
    expect(displayFilePath('/w/p/a.ts', '/w/p')).toBe('a.ts');
    expect(displayFilePath('/w/p/a.ts', '/w/p/')).toBe('a.ts');
    expect(displayFilePath('/w/q/a.ts', '/w/p')).toBe('/w/q/a.ts');
    expect(displayFilePath('/w/p', '/w/p')).toBe('/w/p');
    expect(displayFilePath('/w/p/a.ts', null)).toBe('/w/p/a.ts');
  });

  it('treats /private firmlinked roots as their short form', () => {
    expect(displayFilePath('/private/tmp/p/c.txt', '/tmp/p')).toBe('c.txt');
    expect(displayFilePath('/tmp/p/c.txt', '/private/tmp/p')).toBe('c.txt');
    expect(displayFilePath('/private/home/p/c.txt', '/home/p')).toBe('/private/home/p/c.txt');
  });
});
