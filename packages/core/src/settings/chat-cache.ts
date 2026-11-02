/** What Chat keeps on this device, as Settings sees it. */
export interface ChatCache {
  /** Bytes on disk. */
  diskUsage(): Promise<number>;
  removeAll(): Promise<void>;
}

/** A cache with nothing in it, until Chat has one. */
export const emptyChatCache: ChatCache = {
  diskUsage: () => Promise.resolve(0),
  removeAll: () => Promise.resolve(),
};

export type ByteUnit = 'bytes' | 'KB' | 'MB' | 'GB';

/** A size in decimal units with one decimal ("1.5 KB"), as Foundation's file style does. */
export function formatByteCount(bytes: number): { value: number; unit: ByteUnit } {
  if (bytes < 1000) return { value: bytes, unit: 'bytes' };
  const units: ByteUnit[] = ['KB', 'MB', 'GB'];
  let value = bytes / 1000;
  let index = 0;
  while (value >= 1000 && index < units.length - 1) {
    value /= 1000;
    index += 1;
  }
  return { value: Math.round(value * 10) / 10, unit: units[index] ?? 'GB' };
}
