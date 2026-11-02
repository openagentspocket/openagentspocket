import { describe, expect, it } from 'vitest';
import { notice, toolActivity } from './model/factories';
import type { ToolKind } from './model/types';
import { noticeTitleText, toolNoteText, toolSubtitleText, toolTitleText } from './titles';

describe('noticeTitleText', () => {
  it('keys the fixed titles and fills the placeholders', () => {
    expect(noticeTitleText(notice('planMode', 'Entered plan mode'))).toEqual({
      key: 'Entered plan mode',
    });
    expect(noticeTitleText(notice('modelChange', 'Switched from a to b'))).toEqual({
      key: 'Switched from %@ to %@',
      args: ['a', 'b'],
    });
    expect(noticeTitleText(notice('modelChange', 'Switched to b'))).toEqual({
      key: 'Switched to %@',
      args: ['b'],
    });
    expect(noticeTitleText(notice('system', 'Teammate @ann finished'))).toEqual({
      key: 'Teammate @%@ finished',
      args: ['ann'],
    });
    expect(noticeTitleText(notice('taskNotification', 'Background task failed'))).toEqual({
      key: 'Background task %@',
      args: ['failed'],
    });
  });

  it('leaves free text alone, whatever the kind', () => {
    expect(noticeTitleText(notice('command', 'Hook'))).toBe('Hook');
    expect(noticeTitleText(notice('taskNotification', 'Build finished in 3s'))).toBe(
      'Build finished in 3s',
    );
    expect(noticeTitleText(notice('error', 'Rate limited'))).toBe('Rate limited');
  });
});

describe('tool texts', () => {
  const row = (kind: ToolKind, name: string, title: string) =>
    toolActivity({ kind, name, title, status: 'succeeded' });

  it('keys fixed and templated tool titles', () => {
    expect(toolTitleText(row('todo', 'update_plan', 'Update plan'))).toEqual({
      key: 'Update plan',
    });
    expect(toolTitleText(row('other', 'ToolSearch', 'Loaded a, b'))).toEqual({
      key: 'Loaded %@',
      args: ['a, b'],
    });
    expect(toolTitleText(row('todo', 'TaskUpdate', 'Task #3: done'))).toEqual({
      key: 'Task #%@: %@',
      args: ['3', 'done'],
    });
  });

  it('does not translate a user-chosen title that looks like one', () => {
    expect(toolTitleText(row('command', 'Bash', 'Update plan'))).toBe('Update plan');
    expect(toolTitleText(row('other', 'Skill', 'Loaded x'))).toBe('Loaded x');
  });

  it('keys the teammate subtitle and the closed-question note', () => {
    expect(toolSubtitleText({ kind: 'agent', subtitle: 'Teammate @ann' })).toEqual({
      key: 'Teammate @%@',
      args: ['ann'],
    });
    expect(toolSubtitleText({ kind: 'agent', subtitle: null })).toBeNull();
    expect(toolNoteText('Question closed')).toEqual({ key: 'Question closed' });
    expect(toolNoteText('other')).toBe('other');
  });
});
