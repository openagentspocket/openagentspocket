// What Claude Code records for `/context` typed while idle (captured from Claude Code 2.1, then
// sanitized: invented names, short tables). Three records, each the child of the one before: the
// command, its terminal output (ANSI colors and grid glyphs), and a meta user record with the same
// data as markdown, which the model reads next turn. No model turn runs.

const ESC = '\u001b';
const BASE = '"isSidechain":false,"sessionId":"s-ctx","timestamp":"2026-11-13T18:48:19.500Z"';

export const CONTEXT_MARKDOWN = [
  '## Context Usage',
  '',
  '**Model:** example-model  ',
  '**Tokens:** 39k / 200k (20%)',
  '',
  '### Estimated usage by category',
  '',
  '| Category | Tokens | Percentage |',
  '|----------|--------|------------|',
  '| System prompt | 5.6k | 2.8% |',
  '| Messages | 2.4k | 1.2% |',
  '| Free space | 161k | 80.5% |',
  '',
  '### Skills',
  '',
  '| Skill | Source | Tokens |',
  '|-------|--------|--------|',
  '| release-notes | User | ~250 |',
  '',
].join('\n');

const STDOUT = [
  ` ${ESC}[1mContext Usage${ESC}[22m`,
  `${ESC}[38;5;244m⛁ ${ESC}[38;5;246m⛀ ⛶ ⛶ ${ESC}[39m  Example Model`,
  `${ESC}[38;5;246m⛶ ⛶ ⛶ ⛝ ${ESC}[39m  ${ESC}[38;5;246m39k/200k tokens (20%)${ESC}[39m`,
  `  ${ESC}[38;5;244m⛁${ESC}[39m System prompt: ${ESC}[38;5;246m5.6k tokens (2.8%)${ESC}[39m`,
  '',
  `${ESC}[38;5;246m/context all to expand${ESC}[39m`,
].join('\n');

const record = (fields: string) => `{${fields},${BASE}}`;

/** The command, as `/context` typed with the arguments `args`. */
export const contextCommand = (uuid = 'cmd1', parent: string | null = null, args = '') =>
  record(
    `"type":"system","subtype":"local_command","level":"info","isMeta":false,"uuid":"${uuid}","parentUuid":${parent === null ? 'null' : `"${parent}"`},"content":${JSON.stringify(`<command-name>/context</command-name>\n            <command-message>context</command-message>\n            <command-args>${args}</command-args>`)}`,
  );

/** Its terminal output. */
export const contextStdout = (uuid = 'out1', parent = 'cmd1') =>
  record(
    `"type":"system","subtype":"local_command","level":"info","isMeta":false,"isDisplayOnly":true,"commandRun":{"command":"context","args":""},"uuid":"${uuid}","parentUuid":"${parent}","content":${JSON.stringify(`<local-command-stdout>${STDOUT}</local-command-stdout>`)}`,
  );

/** The same data as markdown, for the model. */
export const contextMarkdown = (uuid = 'md1', parent = 'out1') =>
  record(
    `"type":"user","isMeta":true,"promptId":"p-ctx","uuid":"${uuid}","parentUuid":"${parent}","message":{"role":"user","content":${JSON.stringify(CONTEXT_MARKDOWN)}}`,
  );

/** The three records in the order Claude Code writes them. */
export const CONTEXT_RECORDS = [contextCommand(), contextStdout(), contextMarkdown()];
