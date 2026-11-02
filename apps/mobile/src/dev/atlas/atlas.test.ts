import atlasMap from './atlasMap.json';
import { atlasEntries } from './entries';

describe('atlas registry', () => {
  it('maps exactly the screens the scripts capture', () => {
    expect(Object.keys(atlasEntries).sort()).toEqual(atlasMap.map((screen) => screen.id).sort());
  });

  it('uses Swift screen ids (area.name) or the rn. prefix, each once', () => {
    const ids = atlasMap.map((screen) => screen.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z-]+\.[a-z0-9-]+$/);
  });
});
