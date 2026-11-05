import { lstatSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";

/**
 * Per-Host provider settings, `providers.json` in the plugin's config directory, written by the
 * Host's owner and never by the app: `{ "hermes": { "apiKeyFile": "/abs/path/to/key" } }`.
 * Secrets are never inlined; a settings entry only names the file that holds one.
 */
export function readProviderConfig(configDir, program) {
  try {
    const all = JSON.parse(readFileSync(join(configDir, "providers.json"), "utf8"));
    const entry = all?.[program];
    return entry !== null && typeof entry === "object" && !Array.isArray(entry) ? entry : null;
  } catch {
    return null;
  }
}

/**
 * The secret a settings entry names: an absolute path to a regular file only its owner can read
 * (no group or other bits), at most 512 bytes. Null otherwise; the value is never logged or echoed.
 */
export function readSecretFile(path) {
  if (typeof path !== "string" || !isAbsolute(path)) return null;
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || (stat.mode & 0o077) !== 0 || stat.size === 0 || stat.size > 512) return null;
    return readFileSync(path, "utf8").trim() || null;
  } catch {
    return null;
  }
}
