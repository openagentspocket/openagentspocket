import { encodeQuickKey, NO_MODIFIERS } from '@openagentspocket/core';
import { CONTROL_KEYS, FULL_KEYBOARD, type KeyRows } from './keyTables';

describe.each([
  ['control keys', CONTROL_KEYS],
  ['full keyboard', FULL_KEYBOARD],
] as [string, KeyRows][])('%s table', (_name, table) => {
  const specs = table.rows.flat();

  it('has unique ids, so a tap maps back to exactly one key', () => {
    const ids = specs.map((spec) => spec.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('maps every non-modifier key back and encodes it', () => {
    for (const spec of specs.filter((candidate) => !candidate.modifier)) {
      const key = table.lookup.get(spec.id);
      expect(key).toBeDefined();
      if (key) expect(encodeQuickKey(key, NO_MODIFIERS)).not.toBeNull();
    }
  });

  it('labels every key for a screen reader', () => {
    for (const spec of specs)
      expect((spec.accessibilityLabel ?? spec.label).length).toBeGreaterThan(0);
  });
});

describe('full keyboard', () => {
  it('carries the sticky modifiers and a space bar', () => {
    const ids = FULL_KEYBOARD.rows.flat().map((spec) => spec.id);
    expect(ids).toEqual(
      expect.arrayContaining(['mod-control', 'mod-option', 'mod-shift', 'char-space']),
    );
  });
});
