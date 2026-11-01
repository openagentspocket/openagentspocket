/**
 * A decoded JSON tree. Event payloads are schema-free (herdr types only 3 of its 26 event kinds),
 * so events carry their data as a JsonValue and consumers pick out the fields they know.
 */
export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;
export type JsonObject = { [key: string]: JsonValue };

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The value under `key` if `value` is an object that holds one (own keys only). */
export function jsonField(value: JsonValue | undefined, key: string): JsonValue | undefined {
  if (!isJsonObject(value) || !Object.hasOwn(value, key)) return undefined;
  return value[key];
}

export function jsonString(value: JsonValue | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Parses one JSON text; undefined for anything that is not JSON. */
export function parseJson(text: string): JsonValue | undefined {
  try {
    return JSON.parse(text) as JsonValue;
  } catch {
    return undefined;
  }
}
