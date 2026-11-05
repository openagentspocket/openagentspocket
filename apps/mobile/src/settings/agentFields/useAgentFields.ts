import { useSyncExternalStore } from 'react';
import { DEFAULT_ROWS, type FieldRow } from './fieldCatalog';

/**
 * The per-Host Agent row layout. In memory only: the persisted catalog and the plugin snapshot sync
 * have no RN logic yet (see docs/progress/UX1-settings-pages.md), so edits last for the session.
 */
const layouts = new Map<string, readonly FieldRow[]>();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

const read = (hostId: string): readonly FieldRow[] => layouts.get(hostId) ?? DEFAULT_ROWS;

export function setAgentRows(hostId: string, rows: readonly FieldRow[] | null) {
  if (rows) layouts.set(hostId, rows);
  else layouts.delete(hostId);
  for (const listener of listeners) listener();
}

export function useAgentRows(hostId: string): readonly FieldRow[] {
  return useSyncExternalStore(subscribe, () => read(hostId));
}

export const addField = (hostId: string, rowId: string, field: string) =>
  setAgentRows(
    hostId,
    read(hostId).map((row) =>
      row.id === rowId && !row.fields.includes(field)
        ? { ...row, fields: [...row.fields, field] }
        : row,
    ),
  );

export const removeField = (hostId: string, rowId: string, field: string) =>
  setAgentRows(
    hostId,
    read(hostId).map((row) =>
      row.id === rowId ? { ...row, fields: row.fields.filter((id) => id !== field) } : row,
    ),
  );
