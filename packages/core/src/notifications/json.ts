import { isJsonObject, type JsonObject, type JsonValue } from '../wire/json';

/** The string stored under `key`, or undefined when absent, mistyped, or not an object. */
export function stringField(value: JsonValue | undefined, key: string): string | undefined {
  if (!isJsonObject(value)) return undefined;
  const field = value[key];
  return typeof field === 'string' ? field : undefined;
}

/** Whether `key` holds exactly `true`: the fail-closed reading of every notify flag. */
export function isTrueField(value: JsonValue | undefined, key: string): boolean {
  return isJsonObject(value) && value[key] === true;
}

export function jsonEqual(a: JsonValue | undefined, b: JsonValue | undefined): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, index) => jsonEqual(item, b[index]));
  }
  if (isJsonObject(a) && isJsonObject(b)) {
    const keys = Object.keys(a);
    return (
      keys.length === Object.keys(b).length && keys.every((k) => k in b && jsonEqual(a[k], b[k]))
    );
  }
  return false;
}

/** The object with `fields` laid over it; a non-object base is replaced outright. */
export function mergeFields(base: JsonValue, fields: JsonObject): JsonObject {
  return { ...(isJsonObject(base) ? base : {}), ...fields };
}

/** Sorted keys keep the output deterministic; the v1 contract imposes no canonical order. */
export function encodeSortedJson(value: JsonValue): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return item;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(item).sort()) {
      sorted[key] = (item as Record<string, unknown>)[key];
    }
    return sorted;
  });
}
