// An OpenCode session id as herdr's OpenCode integration reports it: `ses_`, 12 lowercase
// hexadecimal digits and 14 ASCII letters or digits (OpenCode 2.0.32). Checked before the id reaches
// a query, a cache key or a Host script (ADR 0025), and kept as reported: ids are case-sensitive.

const SESSION_ID = /^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$/;

/** The id when it has OpenCode's shape, else null. */
export function openCodeSessionID(value: string): string | null {
  return SESSION_ID.test(value) ? value : null;
}
