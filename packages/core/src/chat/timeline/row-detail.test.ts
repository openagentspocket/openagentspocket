import { describe, expect, it } from 'vitest';
import { toolActivity } from '../model/factories';
import { diffHunkHeader, diffHunkLines, toolDetailText } from './row-detail';

const hunk = {
  oldStart: 10,
  oldLines: 3,
  newStart: 10,
  newLines: 3,
  lines: [' alpha', '-beta', '+BETA', '\\ No newline at end of file', ' gamma'],
};

describe('diff hunks of a Chat file change', () => {
  it('numbers each side as it goes and drops the no-newline marker', () => {
    expect(diffHunkLines(hunk)).toEqual([
      { kind: 'context', oldNumber: 10, newNumber: 10, text: 'alpha' },
      { kind: 'del', oldNumber: 11, text: 'beta' },
      { kind: 'add', newNumber: 11, text: 'BETA' },
      { kind: 'context', oldNumber: 12, newNumber: 12, text: 'gamma' },
    ]);
  });

  it('names the hunk the way a patch does', () => {
    expect(diffHunkHeader(hunk)).toBe('@@ -10,3 +10,3 @@');
  });
});

describe('what a tool row shows and copies', () => {
  const tool = toolActivity({ kind: 'command', name: 'Bash', title: 'ls', status: 'succeeded' });

  it('is the preview, marked when it was cut', () => {
    const preview = { text: 'line one', isTruncated: true, imageCount: 0 };
    expect(toolDetailText({ ...tool, preview })).toBe('line one\n…');
  });

  it('is nothing without a preview', () => {
    expect(toolDetailText({ ...tool, preview: null })).toBeNull();
  });
});
