// How each program names a session: an id is validated here before it becomes a path or a query
// argument.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const OPENCODE_ID = /^ses_[0-9a-f]{12}[0-9a-zA-Z]{14}$/;
/**
 * Hermes Agent mints ids in many shapes (`local-<hex>`, `<date>_<time>_<hex>`, `cron_<job>_<date>`, a
 * UUID) and cron job ids are the user's, so what counts is what a SQL literal may safely hold.
 */
const HERMES_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export const canonicalUUID = (value: string) => (UUID.test(value) ? value.toLowerCase() : null);
// Grok names the session folder with the id as given, so another case would name a folder it never wrote.
export const lowercaseUUIDv7 = (value: string) => (UUID_V7.test(value) ? value : null);
export const openCodeID = (value: string) => (OPENCODE_ID.test(value) ? value : null);
export const hermesID = (value: string) => (HERMES_ID.test(value) ? value : null);
