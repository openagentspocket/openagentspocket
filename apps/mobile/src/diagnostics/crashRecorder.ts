/** What the recorder keeps of the last uncaught JavaScript error. */
export interface CrashRecord {
  at: number;
  message: string;
  stack: string;
  fatal: boolean;
}

/** The synchronous key-value store (expo-sqlite's kv-store): a write must land before the process dies. */
export interface CrashStorage {
  getItemSync(key: string): string | null;
  setItemSync(key: string, value: string): void;
}

/** React Native's global error hook (`ErrorUtils`), the slice the recorder wraps. */
export interface ErrorHooks {
  getGlobalHandler(): (error: unknown, isFatal?: boolean) => void;
  setGlobalHandler(handler: (error: unknown, isFatal?: boolean) => void): void;
}

const KEY = 'diagnostics.lastCrash';

function describe(error: unknown): { message: string; stack: string } {
  if (error instanceof Error) return { message: error.message, stack: error.stack ?? '' };
  return { message: String(error), stack: '' };
}

/**
 * Keeps the last uncaught JS error on disk before React Native's own handler runs. A fatal one
 * ends the process right after (a release build aborts), so without this the reason is lost: the
 * iOS crash log only says that a TurboModule rethrew. The error then goes on to the previous
 * handler unchanged.
 */
export function installCrashRecorder(
  hooks: ErrorHooks | undefined,
  storage: CrashStorage,
  now: () => number = Date.now,
): void {
  if (!hooks) return;
  const previous = hooks.getGlobalHandler();
  hooks.setGlobalHandler((error, isFatal) => {
    try {
      const record: CrashRecord = { at: now(), fatal: isFatal === true, ...describe(error) };
      storage.setItemSync(KEY, JSON.stringify(record));
    } catch {
      // Recording must never replace the error it records.
    }
    previous(error, isFatal);
  });
}

/** The error recorded before the app last closed, if one was not dismissed. */
export function readLastCrash(storage: CrashStorage): CrashRecord | undefined {
  try {
    const raw = storage.getItemSync(KEY);
    if (!raw) return undefined;
    const record = JSON.parse(raw) as Partial<CrashRecord>;
    if (typeof record.message !== 'string' || typeof record.at !== 'number') return undefined;
    return {
      at: record.at,
      message: record.message,
      stack: record.stack ?? '',
      fatal: record.fatal === true,
    };
  } catch {
    return undefined;
  }
}

export function clearLastCrash(storage: CrashStorage): void {
  storage.setItemSync(KEY, '');
}

/** The text to copy into a report. */
export function crashReportText(record: CrashRecord): string {
  return [new Date(record.at).toISOString(), record.message, record.stack]
    .filter(Boolean)
    .join('\n');
}
