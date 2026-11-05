import { describe, expect, it, vi } from 'vitest';
import { MemoryStorage } from '../hosts/known-hosts';
import { AGENT_FIELDS_STORAGE_KEY, AgentFieldsStore, DEFAULT_AGENT_ROWS } from './agent-fields';

describe('AgentFieldsStore', () => {
  it('serves the defaults until a Host saves rows, and persists edits per Host', () => {
    const storage = new MemoryStorage();
    const store = new AgentFieldsStore(storage);
    expect(store.rows('a')).toBe(DEFAULT_AGENT_ROWS);
    store.addField('a', 'row1', 'host');
    expect(store.rows('a')[0]?.fields).toEqual(['workspace', 'host']);
    expect(store.rows('b')).toBe(DEFAULT_AGENT_ROWS);
    expect(new AgentFieldsStore(storage).rows('a')[0]?.fields).toEqual(['workspace', 'host']);
  });

  it('moves a field within its row and keeps it inside the bounds', () => {
    const store = new AgentFieldsStore(new MemoryStorage());
    store.addField('a', 'row1', 'host');
    store.moveField('a', 'row1', 'host', -1);
    expect(store.rows('a')[0]?.fields).toEqual(['host', 'workspace']);
    store.moveField('a', 'row1', 'host', -1);
    expect(store.rows('a')[0]?.fields).toEqual(['host', 'workspace']);
  });

  it('toggles the secondary style and forgets it when the field goes', () => {
    const store = new AgentFieldsStore(new MemoryStorage());
    store.toggleStyle('a', 'row1', 'workspace');
    expect(store.rows('a')[0]?.dim).toEqual(['workspace']);
    store.toggleStyle('a', 'row1', 'workspace');
    expect(store.rows('a')[0]?.dim).toEqual([]);
    store.toggleStyle('a', 'row1', 'workspace');
    store.removeField('a', 'row1', 'workspace');
    expect(store.rows('a')[0]?.dim).toEqual([]);
  });

  it('flags unreadable data, leaves it untouched and recovers on reset', () => {
    const storage = new MemoryStorage();
    storage.set(AGENT_FIELDS_STORAGE_KEY, '{nope');
    const store = new AgentFieldsStore(storage);
    expect(store.unreadable).toBe(true);
    store.addField('a', 'row1', 'host');
    expect(storage.getString(AGENT_FIELDS_STORAGE_KEY)).toBe('{nope');
    store.reset();
    expect(store.unreadable).toBe(false);
    store.removeField('a', 'row1', 'workspace');
    expect(store.rows('a')[0]?.fields).toEqual([]);
  });

  it('notifies subscribers with a new snapshot on every change', () => {
    const store = new AgentFieldsStore(new MemoryStorage());
    const listener = vi.fn();
    store.subscribe(listener);
    const before = store.snapshot();
    store.setRows('a', null);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.snapshot()).not.toBe(before);
  });
});
