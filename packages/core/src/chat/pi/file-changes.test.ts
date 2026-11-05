import { describe, expect, it } from 'vitest';
import { piFileChanges } from './file-changes';

describe('piFileChanges', () => {
  it('lists each file of a multi-file OMP edit', () => {
    const changes = piFileChanges(
      {
        diff: '-1|a\n+1|A\n\n+1|new',
        firstChangedLine: 1,
        perFileResults: [
          { path: '/p/a.txt', op: 'update', diff: '-1|a\n+1|A', firstChangedLine: 1 },
          { path: '/p/b.txt', op: 'create', diff: '+1|new', snapshotsPruned: true },
          { path: '/p/c.txt', op: 'delete', diff: '' },
        ],
      },
      null,
      '/p',
    );
    expect(changes?.files.map((file) => file.path)).toEqual(['/p/a.txt', '/p/b.txt', '/p/c.txt']);
    expect(changes?.files.map((file) => file.kind)).toEqual(['updated', 'created', 'deleted']);
    expect(changes?.files.map((file) => file.added)).toEqual([1, 1, 0]);
    expect(piFileChanges({}, '/p/a.txt', null)).toBeNull();
  });
});
