import { type KeyValueStorage, MemoryStorage } from '../hosts/known-hosts';
import { LIST_PRESENTATIONS, type ListPresentation } from './list';

export const LIST_PRESENTATION_KEY = 'console-list.presentation-mode';
export const LIST_HOST_FILTER_KEY = 'console-list.host-filter';
export const LIST_COLLAPSED_KEY = 'console-list.collapsed';

/** Idle holds every Agent that asks nothing; it starts folded until the user folds or opens a group. */
const DEFAULT_COLLAPSED: readonly string[] = ['idle'];

function decodeIds(text: string | undefined): ReadonlySet<string> | undefined {
  if (text === undefined) return undefined;
  try {
    const value: unknown = JSON.parse(text);
    if (!Array.isArray(value)) return undefined;
    return new Set(value.filter((id): id is string => typeof id === 'string'));
  } catch {
    return undefined;
  }
}

/**
 * The Agents list choices that outlive the screen: presentation, Host filter and folded groups.
 * Unknown stored values fall back to the defaults, so an older or newer build never breaks the list.
 */
export class ListPreferences {
  private modeValue: ListPresentation;
  private hostValue: string | undefined;
  private collapsedValue: ReadonlySet<string>;

  constructor(private readonly storage: KeyValueStorage = new MemoryStorage()) {
    const stored = storage.getString(LIST_PRESENTATION_KEY);
    this.modeValue = LIST_PRESENTATIONS.find((mode) => mode === stored) ?? 'flat';
    const host = storage.getString(LIST_HOST_FILTER_KEY);
    this.hostValue = host === undefined || host === '' ? undefined : host;
    this.collapsedValue =
      decodeIds(storage.getString(LIST_COLLAPSED_KEY)) ?? new Set(DEFAULT_COLLAPSED);
  }

  get presentation(): ListPresentation {
    return this.modeValue;
  }

  get hostId(): string | undefined {
    return this.hostValue;
  }

  get collapsed(): ReadonlySet<string> {
    return this.collapsedValue;
  }

  setPresentation(mode: ListPresentation): void {
    if (mode === this.modeValue) return;
    this.modeValue = mode;
    this.storage.set(LIST_PRESENTATION_KEY, mode);
  }

  /** `undefined` shows every Host. */
  setHostId(hostId: string | undefined): void {
    if (hostId === this.hostValue) return;
    this.hostValue = hostId;
    this.storage.set(LIST_HOST_FILTER_KEY, hostId ?? '');
  }

  toggleCollapsed(id: string): void {
    const next = new Set(this.collapsedValue);
    if (!next.delete(id)) next.add(id);
    this.collapsedValue = next;
    this.storage.set(LIST_COLLAPSED_KEY, JSON.stringify([...next].sort()));
  }
}
