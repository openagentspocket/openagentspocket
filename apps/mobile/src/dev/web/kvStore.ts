/** Web stand-in for `expo-sqlite/kv-store`: a per-page in-memory map (nothing persists in the atlas). */
const memory = new Map<string, string>();

const Storage = {
  getItemSync: (key: string): string | null => memory.get(key) ?? null,
  setItemSync: (key: string, value: string): void => {
    memory.set(key, value);
  },
};

export default Storage;
