import type { KeyValueStorage } from '../hosts/known-hosts';

/** One console row of an Agent: the field ids it shows, in order. */
export interface AgentFieldRow {
  id: string;
  fields: readonly string[];
  /** Fields drawn in the secondary style (dimmed). */
  dim?: readonly string[];
}

/** What a Host with no saved choice shows: herdr's sidebar rows, then the app's own third row. */
export const DEFAULT_AGENT_ROWS: readonly AgentFieldRow[] = [
  { id: 'row1', fields: ['workspace'] },
  { id: 'row2', fields: ['terminal_title_stripped'] },
  { id: 'row3', fields: ['directory'] },
];

export const AGENT_FIELDS_STORAGE_KEY = 'agentFields.v1';

type Listener = () => void;
type Layouts = Readonly<Record<string, readonly AgentFieldRow[]>>;

const isStrings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const isRow = (value: unknown): value is AgentFieldRow => {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Partial<AgentFieldRow>;
  return typeof row.id === 'string' && isStrings(row.fields) && (!row.dim || isStrings(row.dim));
};

/** Parses the stored JSON; null when it is not a map of Host ids to row lists. */
function parse(raw: string | undefined): Layouts | null {
  if (raw === undefined) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    const entries = Object.entries(value);
    return entries.every(([, rows]) => Array.isArray(rows) && rows.every(isRow))
      ? (value as Layouts)
      : null;
  } catch {
    return null;
  }
}

/**
 * The per-Host Agent row layouts: one JSON object in a key-value store, a Host without an entry
 * follows the defaults. Stored data that cannot be read is left untouched and flagged `unreadable`
 * (editing pauses) until `reset()` deletes it, as the Swift app does. `snapshot()` is stable
 * between changes, so it feeds `useSyncExternalStore`.
 */
export class AgentFieldsStore {
  private layouts: Layouts = {};
  private bad = false;
  private version = 0;
  private readonly listeners = new Set<Listener>();

  constructor(
    private readonly storage: KeyValueStorage,
    private readonly storageKey: string = AGENT_FIELDS_STORAGE_KEY,
  ) {
    this.load();
  }

  /** Changes on every update; the value a hook subscribes to. */
  snapshot = (): number => this.version;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  get unreadable(): boolean {
    return this.bad;
  }

  rows(hostId: string): readonly AgentFieldRow[] {
    return this.layouts[hostId] ?? DEFAULT_AGENT_ROWS;
  }

  /** Saves a Host's rows; null puts the Host back on the defaults. Ignored while unreadable. */
  setRows(hostId: string, rows: readonly AgentFieldRow[] | null): void {
    if (this.bad) return;
    const next = { ...this.layouts };
    if (rows) next[hostId] = rows;
    else delete next[hostId];
    this.layouts = next;
    this.storage.set(this.storageKey, JSON.stringify(next));
    this.emit();
  }

  addField(hostId: string, rowId: string, field: string): void {
    this.setRows(
      hostId,
      this.rows(hostId).map((row) =>
        row.id === rowId && !row.fields.includes(field)
          ? { ...row, fields: [...row.fields, field] }
          : row,
      ),
    );
  }

  removeField(hostId: string, rowId: string, field: string): void {
    this.setRows(
      hostId,
      this.rows(hostId).map((row) =>
        row.id === rowId
          ? {
              ...row,
              fields: row.fields.filter((id) => id !== field),
              dim: row.dim?.filter((id) => id !== field),
            }
          : row,
      ),
    );
  }

  /** Flips a field between the default and the secondary (dimmed) style. */
  toggleStyle(hostId: string, rowId: string, field: string): void {
    this.setRows(
      hostId,
      this.rows(hostId).map((row) => {
        if (row.id !== rowId) return row;
        const dim = row.dim ?? [];
        return {
          ...row,
          dim: dim.includes(field) ? dim.filter((id) => id !== field) : [...dim, field],
        };
      }),
    );
  }

  /** Moves a field one step within its row (`-1` earlier, `1` later). */
  moveField(hostId: string, rowId: string, field: string, step: -1 | 1): void {
    this.setRows(
      hostId,
      this.rows(hostId).map((row) => {
        const from = row.fields.indexOf(field);
        const to = from + step;
        if (row.id !== rowId || from < 0 || to < 0 || to >= row.fields.length) return row;
        const fields = [...row.fields];
        fields.splice(to, 0, ...fields.splice(from, 1));
        return { ...row, fields };
      }),
    );
  }

  /** Deletes every saved layout (readable or not): every Host follows the defaults again. */
  reset(): void {
    this.layouts = {};
    this.bad = false;
    this.storage.set(this.storageKey, '{}');
    this.emit();
  }

  /** Reads the storage again, after something else wrote to it. */
  reload(): void {
    this.load();
    this.emit();
  }

  private load(): void {
    const parsed = parse(this.storage.getString(this.storageKey));
    this.bad = parsed === null;
    this.layouts = parsed ?? {};
  }

  private emit(): void {
    this.version += 1;
    for (const listener of this.listeners) listener();
  }
}
