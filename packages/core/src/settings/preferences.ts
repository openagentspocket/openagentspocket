import type { KeyValueStorage } from '../hosts/known-hosts';

/** Built-in theme ids and their appearance (the app's `ThemeId`; a test pins them to the tokens). */
export const THEME_APPEARANCE = { indigo: 'dark', papel: 'light', noche: 'dark' } as const;
export type SettingsThemeId = keyof typeof THEME_APPEARANCE;
export type Appearance = 'dark' | 'light';

export const TERMINAL_FONTS = ['jetbrains-mono', 'ibm-plex-mono', 'menlo', 'courier-new'] as const;
/** The curated terminal palettes (their colors live in the app's palette data). */
export const TERMINAL_THEMES = [
  'follow-system',
  'vesper',
  'apple-system-colors',
  'dracula',
  'solarized',
  'catppuccin',
  'tokyo-night',
  'gruvbox',
  'nord',
  'monokai-pro',
  'rose-pine',
  'ayu',
  'one-half',
  'kanagawa',
  'everforest',
  'github',
  'night-owl',
  'iceberg',
  'flexoki',
  'selenized',
  'modus',
  'tomorrow',
  'melange',
  'zenbones',
  'atom-one-dark',
  'snazzy',
  'oceanic-next',
  'poimandres',
  'horizon',
  'zenburn',
] as const;
export const CHAT_FONTS = ['system', 'rounded', 'serif', 'monospaced'] as const;
export const GRACE_PERIODS = ['immediately', 'oneMinute', 'fiveMinutes', 'fifteenMinutes'] as const;

export type TerminalFont = (typeof TERMINAL_FONTS)[number];
export type TerminalThemeId = (typeof TERMINAL_THEMES)[number];
export type ChatFont = (typeof CHAT_FONTS)[number];
export type GracePeriod = (typeof GRACE_PERIODS)[number];

export const TERMINAL_FONT_SIZE_RANGE = { min: 4, max: 32 } as const;
export const CHAT_TEXT_OFFSET_RANGE = { min: -3, max: 3 } as const;

/** Every persisted setting with its value type. */
export interface SettingsValues {
  followSystem: boolean;
  theme: SettingsThemeId;
  darkTheme: SettingsThemeId;
  lightTheme: SettingsThemeId;
  terminalFont: TerminalFont;
  terminalFontSize: number;
  terminalTheme: TerminalThemeId;
  chatFont: ChatFont;
  /** Dynamic-type steps from the system text size. */
  chatTextOffset: number;
  foldFinishedTurns: boolean;
  toolbarEscape: boolean;
  toolbarTab: boolean;
  toolbarDPad: boolean;
  toolbarHaptics: boolean;
  appLockEnabled: boolean;
  appLockGrace: GracePeriod;
  appLockForKeys: boolean;
}

export type SettingKey = keyof SettingsValues;

export const SETTINGS_DEFAULTS: Readonly<SettingsValues> = {
  followSystem: false,
  theme: 'indigo',
  darkTheme: 'indigo',
  lightTheme: 'papel',
  terminalFont: 'jetbrains-mono',
  terminalFontSize: 8,
  terminalTheme: 'follow-system',
  chatFont: 'system',
  chatTextOffset: -2,
  foldFinishedTurns: true,
  toolbarEscape: true,
  toolbarTab: true,
  toolbarDPad: true,
  toolbarHaptics: true,
  appLockEnabled: false,
  appLockGrace: 'immediately',
  appLockForKeys: false,
};

export const SETTING_KEYS = Object.keys(SETTINGS_DEFAULTS) as SettingKey[];
const isSettingKey = (key: string): key is SettingKey => key in SETTINGS_DEFAULTS;

const THEMES = Object.keys(THEME_APPEARANCE);
const themesOf = (appearance: Appearance) =>
  THEMES.filter((id) => THEME_APPEARANCE[id as SettingsThemeId] === appearance);

const ALLOWED: Partial<Record<SettingKey, readonly string[]>> = {
  theme: THEMES,
  darkTheme: themesOf('dark'),
  lightTheme: themesOf('light'),
  terminalFont: TERMINAL_FONTS,
  terminalTheme: TERMINAL_THEMES,
  chatFont: CHAT_FONTS,
  appLockGrace: GRACE_PERIODS,
};

const NUMBER_RANGE: Partial<Record<SettingKey, { min: number; max: number }>> = {
  terminalFontSize: TERMINAL_FONT_SIZE_RANGE,
  chatTextOffset: CHAT_TEXT_OFFSET_RANGE,
};

/** Coerces a value to a valid one for its key; undefined when it is unusable. */
function sanitize(key: SettingKey, raw: unknown): SettingsValues[SettingKey] | undefined {
  const fallback = SETTINGS_DEFAULTS[key];
  if (typeof fallback === 'boolean') return typeof raw === 'boolean' ? raw : undefined;
  if (typeof fallback === 'number') {
    const range = NUMBER_RANGE[key];
    if (typeof raw !== 'number' || !Number.isFinite(raw) || !range) return undefined;
    return Math.min(range.max, Math.max(range.min, Math.round(raw)));
  }
  const allowed = ALLOWED[key] ?? [];
  return typeof raw === 'string' && allowed.includes(raw) ? (raw as never) : undefined;
}

export const SETTINGS_STORAGE_KEY = 'settings.v1';

type Listener = () => void;

/**
 * The app's preferences: one JSON object in a key-value store. Unusable stored values fall back to
 * the default per key, unknown keys survive a write, and `snapshot()` is referentially stable
 * between changes so it can feed `useSyncExternalStore`.
 */
export class SettingsStore {
  private readonly extra: Record<string, unknown> = {};
  private current: SettingsValues;
  private readonly listeners = new Set<Listener>();

  constructor(
    private readonly storage: KeyValueStorage,
    private readonly storageKey: string = SETTINGS_STORAGE_KEY,
  ) {
    this.current = this.load();
  }

  snapshot = (): Readonly<SettingsValues> => this.current;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  get<K extends SettingKey>(key: K): SettingsValues[K] {
    return this.current[key];
  }

  set<K extends SettingKey>(key: K, value: SettingsValues[K]): void {
    this.setRaw(key, value);
  }

  /** Sets a key from a value of unknown type (a picker's string); an invalid one is ignored. */
  setRaw(key: SettingKey, value: unknown): void {
    this.update({ [key]: value } as Partial<SettingsValues>);
  }

  update(patch: Partial<SettingsValues>): void {
    const next = { ...this.current };
    for (const key of Object.keys(patch) as SettingKey[]) {
      const value = sanitize(key, patch[key]);
      if (value !== undefined) Object.assign(next, { [key]: value });
    }
    if (SETTING_KEYS.every((key) => next[key] === this.current[key])) return;
    this.current = next;
    this.storage.set(this.storageKey, JSON.stringify({ ...this.extra, ...next }));
    for (const listener of this.listeners) listener();
  }

  /** Puts the given keys (all by default) back to their defaults. */
  reset(keys: readonly SettingKey[] = SETTING_KEYS): void {
    this.update(Object.fromEntries(keys.map((key) => [key, SETTINGS_DEFAULTS[key]])));
  }

  private load(): SettingsValues {
    const values = { ...SETTINGS_DEFAULTS };
    let parsed: unknown;
    try {
      parsed = JSON.parse(this.storage.getString(this.storageKey) ?? 'null');
    } catch {
      return values;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return values;
    for (const [key, raw] of Object.entries(parsed)) {
      if (!isSettingKey(key)) {
        this.extra[key] = raw;
        continue;
      }
      const value = sanitize(key, raw);
      if (value !== undefined) Object.assign(values, { [key]: value });
    }
    return values;
  }
}
