// The SQL behind each query (Swift OpenCodeProbe+SQL, ADR 0025). Every statement reads one session
// from `session_v2`, `session_message`, `event_sequence` or `session_inbox`, and nothing writes. The
// statements stay within SQLite 3.25 with JSON1: window functions and `pragma_table_info` are fine,
// while `->`, `iif`, `FILTER`, `NULLS FIRST`, `HAVING` without `GROUP BY` and `ORDER BY` inside an
// aggregate are newer. They also stay shallow: SQLite before 3.46 parses on a fixed stack of 100
// entries, and the deepest statement needs about 60 of them.
//
// JSON values lose their JSON subtype when they leave a subquery, a CTE column, or a `CASE` or
// `coalesce`, and would then embed as strings. So a JSON function's result goes straight into
// `json_object`, `json_set` or `json_group_array`, and only a value that is always JSON text and
// crosses such a boundary is wrapped in `json()`. A path that may hold a string or a number is never
// wrapped: `json()` rejects bare text.

import type { OpenCodePollCursor, OpenCodeQuery } from './query';

/** Slimmed rows larger than this arrive without their data. */
export const ROW_DATA_LIMIT = 1_048_576;
/** Tool output on ordinary reads, in characters. */
export const TOOL_OUTPUT_LIMIT = 16_384;
/** Inbox items, and the characters of each item's text. */
export const INBOX_ITEM_LIMIT = 16;
export const INBOX_TEXT_LIMIT = 16_384;
/** Open rows a poll reads again by `seq`. */
export const OPEN_ROW_LIMIT = 64;

export const VERSION_STATEMENT = "SELECT 'V ' || sqlite_version()";

/** OpenCode 1.x tables, printed only when `session_v2` is absent. */
export const TABLES_STATEMENT = `SELECT 'T ' || m FROM (SELECT group_concat(name, ',') AS m FROM sqlite_master
  WHERE type = 'table' AND name IN ('session', 'message', 'part')
    AND NOT EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'session_v2'))
 WHERE m IS NOT NULL`;

/** Every column the queries name, so a changed layout reads as one problem rather than as the first statement that fails. */
export const LAYOUT_STATEMENT = `WITH need(t, c) AS (VALUES
  ('session_v2','id'),('session_v2','parent_id'),('session_v2','title'),('session_v2','version'),
  ('session_v2','revert'),('session_v2','time_updated'),
  ('session_message','id'),('session_message','session_id'),('session_message','type'),
  ('session_message','seq'),('session_message','time_created'),('session_message','time_updated'),
  ('session_message','data'),('event_sequence','aggregate_id'),('event_sequence','seq'),
  ('session_inbox','id'),('session_inbox','session_id'),('session_inbox','type'),
  ('session_inbox','payload'),('session_inbox','delivery'),('session_inbox','enqueued_seq'),
  ('session_inbox','time_created'))
SELECT 'L ' || m FROM (SELECT group_concat(t || '.' || c, ',') AS m FROM need
  WHERE NOT EXISTS (SELECT 1 FROM pragma_table_info(need.t) p WHERE p.name = need.c))
 WHERE m IS NOT NULL`;

export function openCodeStatements(query: OpenCodeQuery): string[] {
  const session = `'${query.session}'`;
  const statements = [
    VERSION_STATEMENT,
    TABLES_STATEMENT,
    LAYOUT_STATEMENT,
    `SELECT 'E ' || coalesce((SELECT seq FROM event_sequence WHERE aggregate_id = ${session}), '')`,
    `SELECT 'M' WHERE NOT EXISTS (SELECT 1 FROM session_v2 WHERE id = ${session})`,
  ];
  const kind = query.query;
  switch (kind.kind) {
    case 'tail':
      statements.push(
        sessionStatement(session, '1'),
        newestRows(session, null, kind.budget),
        firstStatement(session, '1'),
        inboxStatement(session, '1'),
      );
      break;
    case 'poll': {
      const { cursor } = kind;
      const changed =
        cursor.eventSeq === null
          ? '1'
          : `(SELECT seq FROM event_sequence WHERE aggregate_id = ${session}) IS NOT ${cursor.eventSeq}`;
      statements.push(
        sessionStatement(session, changed),
        // The rows that start inside the budget, then `X` for the first row that does not, from one
        // pass over the window.
        `${pollWindow(session, cursor, changed)}
SELECT CASE WHEN acc - len < ${cursor.budget} THEN 'R ' || ${rowObject(ROW_DATA_LIMIT)}
            ELSE 'X' END
  FROM w WHERE coalesce(previous_start, 0) < ${cursor.budget} ORDER BY seq`,
        firstStatement(session, changed),
        `SELECT 'C ' || (SELECT count(*) FROM session_message WHERE session_id = ${session}
    AND seq BETWEEN ${cursor.lowSeq} AND ${cursor.highSeq}) WHERE ${changed}`,
        inboxStatement(session, changed),
      );
      break;
    }
    case 'older':
      statements.push(newestRows(session, kind.before, kind.budget), firstStatement(session, '1'));
      break;
    case 'row': {
      const rows = `SELECT s.id, s.type, s.seq, s.time_created, s.time_updated, s.data
  FROM session_message s WHERE s.session_id = ${session} AND s.seq = ${kind.seq}`;
      statements.push(`WITH ${slimmed(rows, Math.max(0, kind.outputLimit))}
SELECT 'R ' || ${rowObject(null)} FROM r`);
      break;
    }
  }
  return statements;
}

// MARK: Session, first row and inbox

/** A staged revert's patches stay in the store: the line carries only the boundary message, its `seq` and a file count. */
function sessionStatement(session: string, changed: string): string {
  return `SELECT 'S ' || json_object('k','session','id',id,'parent',parent_id,'title',substr(title,1,512),
  'version',version,
  'revertMessage', json_extract(CASE WHEN json_valid(revert) THEN revert END, '$.messageID'),
  'revertFiles', json_array_length(CASE WHEN json_valid(revert) THEN revert END, '$.files'),
  'revertSeq', (SELECT m.seq FROM session_message m WHERE m.session_id = ${session}
     AND m.id = json_extract(CASE WHEN json_valid(session_v2.revert) THEN session_v2.revert END, '$.messageID')),
  'updated', time_updated)
  FROM session_v2 WHERE id = ${session} AND ${changed}`;
}

function firstStatement(session: string, changed: string): string {
  return `SELECT 'F ' || coalesce((SELECT min(seq) FROM session_message WHERE session_id = ${session}), '') WHERE ${changed}`;
}

function inboxStatement(session: string, changed: string): string {
  return `SELECT 'I ' || json_object('k','inbox',
    'items', json(coalesce((SELECT json_group_array(json(item)) FROM (
       SELECT json_object('id',id,'type',type,'delivery',delivery,'seq',enqueued_seq,'tc',time_created,
         'text', substr(json_extract(CASE WHEN json_valid(payload) THEN payload END,'$.text'),1,${INBOX_TEXT_LIMIT}),
         'n', length(json_extract(CASE WHEN json_valid(payload) THEN payload END,'$.text')),
         'files', json(coalesce((SELECT json_group_array(json_extract(f.value,'$.name'))
                    FROM json_each(CASE WHEN json_valid(payload) THEN payload END,'$.files') f
                   WHERE f.type = 'object'), '[]'))) AS item
         FROM session_inbox WHERE session_id = ${session} ORDER BY enqueued_seq LIMIT ${INBOX_ITEM_LIMIT})), '[]')),
    'more', (SELECT max(count(*) - ${INBOX_ITEM_LIMIT}, 0) FROM session_inbox WHERE session_id = ${session}))
 WHERE ${changed}`;
}

// MARK: Rows

/**
 * The newest rows within `budget` bytes of slimmed JSON, below `below` when given, printed oldest
 * first. The newest row always prints. A prefilter on the stored length bounds how many rows are
 * slimmed.
 */
function newestRows(session: string, below: number | null, budget: number): string {
  const bound = below === null ? '' : ` AND seq < ${below}`;
  const rows = `SELECT s.id, s.type, s.seq, s.time_created, s.time_updated, s.data
  FROM session_message s JOIN raw ON raw.seq = s.seq
 WHERE s.session_id = ${session} AND raw.racc - raw.rlen < 4 * ${budget}`;
  return `WITH raw AS (SELECT seq, length(data) AS rlen,
                    sum(length(data)) OVER (ORDER BY seq DESC ROWS UNBOUNDED PRECEDING) AS racc
               FROM session_message WHERE session_id = ${session}${bound}),
${slimmed(rows, TOOL_OUTPUT_LIMIT)},
w AS (SELECT *, length(CAST(d AS BLOB)) AS len,
             sum(length(CAST(d AS BLOB))) OVER (ORDER BY seq DESC ROWS UNBOUNDED PRECEDING) AS acc
        FROM r)
SELECT 'R ' || ${rowObject(ROW_DATA_LIMIT)}
  FROM w WHERE acc - len < ${budget} ORDER BY seq`;
}

/**
 * The rows a poll reads, oldest first with a running total and where the row before each starts:
 * newer than the window, still open, or updated inside it since the last read.
 */
function pollWindow(session: string, cursor: OpenCodePollCursor, changed: string): string {
  const open = cursor.openRows.slice(0, OPEN_ROW_LIMIT).join(',');
  const rows = `SELECT s.id, s.type, s.seq, s.time_created, s.time_updated, s.data
  FROM session_message s
 WHERE s.session_id = ${session} AND ${changed}
   AND (s.seq > ${cursor.highSeq} OR s.seq IN (${open === '' ? 'NULL' : open})
        OR (s.seq >= ${cursor.lowSeq} AND s.time_updated >= ${cursor.updatedSince}))`;
  return `WITH ${slimmed(rows, TOOL_OUTPUT_LIMIT)},
w AS (SELECT *, length(CAST(d AS BLOB)) AS len,
             sum(length(CAST(d AS BLOB))) OVER (ORDER BY seq ROWS UNBOUNDED PRECEDING) AS acc,
             sum(length(CAST(d AS BLOB)))
               OVER (ORDER BY seq ROWS BETWEEN UNBOUNDED PRECEDING AND 2 PRECEDING) AS previous_start
        FROM r)`;
}

/**
 * The CTEs that slim the rows `rows` selects from `session_message`: `m` holds those rows;
 * `items` each step's content items, with a tool call's output text and changed files read out;
 * `slim_items` each item as Chat reads it; and `r` each row as Chat reads it, as `f` and `d`.
 *
 * SQLite before 3.46 parses on a fixed stack of 100 entries and fails a statement nested deeper
 * with "parser stack overflow" (Debian 12 and Ubuntu 24.04 ship such SQLite). So an item is built
 * at the top of its own CTE rather than inside its row's expression, and a step gathers its items by
 * `seq`, in `json_each` order.
 */
function slimmed(rows: string, outputLimit: number): string {
  return `m AS (${rows}),
items AS (SELECT m.seq, c.key AS i, CASE WHEN c.type = 'object' THEN c.value END AS v,
                 ${TOOL_OUTPUT} AS out, ${CHANGED_FILES} AS files
            FROM m, json_each(CASE WHEN m.type = 'assistant' AND json_valid(m.data) THEN m.data END,
                              '$.content') c),
slim_items AS (SELECT seq, i, ${item(outputLimit)} AS item FROM items),
r AS (SELECT m.id, m.type, m.seq, m.time_created AS tc, m.time_updated AS tu,
             ${FINAL_FLAG} AS f, ${SLIM} AS d
        FROM m)`;
}

/** One `{"k":"row",…}` line from the `w` columns. Over `dataLimit` the row carries its size as `big` instead of `d`. */
function rowObject(dataLimit: number | null): string {
  const head = `'k','row','id',id,'type',type,'seq',seq,'tc',tc,'tu',tu,'f',json(CASE WHEN f THEN 'true' ELSE 'false' END)`;
  if (dataLimit === null) return `json_object(${head},'d',json(d))`;
  return `CASE WHEN len <= ${dataLimit} THEN json_object(${head},'d',json(d))
           ELSE json_object(${head},'big',len) END`;
}

/** Whether a row can still change: a step, compaction or shell command that has not finished. */
const FINAL_FLAG = `CASE WHEN json_valid(m.data) THEN CASE
  WHEN m.type IN ('assistant', 'shell')
    THEN coalesce(json_type(m.data, '$.time.completed'), '') IN ('integer', 'real')
  WHEN m.type = 'compaction' THEN coalesce(json_extract(m.data, '$.status'), '') <> 'running'
  ELSE 1 END ELSE 1 END`;

/** A shell-mode command's output text. OpenCode 2.0.32 keeps it in an object with its cursor, size and truncation; a string reads as is. */
const SHELL_OUTPUT = `CASE json_type(m.data, '$.output') WHEN 'object' THEN json_extract(m.data, '$.output.output') ELSE json_extract(m.data, '$.output') END`;

/**
 * The row's data, cut to what Chat shows. A row that is not JSON reads as `{"k":"invalid"}`. A step
 * keeps its items from `slim_items`, and a failed compaction its error's type and the first 16 Ki
 * characters of its message.
 */
const SLIM = `CASE WHEN json_valid(m.data) THEN CASE
  WHEN m.type = 'assistant' THEN ${assistantData()}
  WHEN m.type = 'user' THEN ${userData()}
  WHEN m.type = 'compaction' THEN json_object('status', json_extract(m.data, '$.status'),
      'reason', json_extract(m.data, '$.reason'),
      'summary', substr(json_extract(m.data, '$.summary'), 1, 65536),
      'error', json(CASE WHEN json_type(m.data, '$.error') = 'object' THEN json_object(
        'type', json_extract(m.data, '$.error.type'),
        'message', substr(json_extract(m.data, '$.error.message'), 1, 16384)) END),
      'time', json_extract(m.data, '$.time'))
  WHEN m.type = 'shell' THEN json_object('command', json_extract(m.data, '$.command'),
      'status', json_extract(m.data, '$.status'), 'exit', json_extract(m.data, '$.exit'),
      'output', substr(${SHELL_OUTPUT}, 1, ${TOOL_OUTPUT_LIMIT}),
      'n', length(${SHELL_OUTPUT}), 'time', json_extract(m.data, '$.time'))
  WHEN m.type IN ('synthetic', 'system') THEN json_object(${noteArguments()})
  WHEN m.type = 'skill' THEN json_object(${noteArguments()},
      'skill', json_extract(m.data, '$.skill'), 'name', json_extract(m.data, '$.name'))
  WHEN m.type IN ('idle', 'agent-switched', 'model-switched', 'location-switched') THEN
    CASE WHEN length(CAST(m.data AS BLOB)) < 4096 THEN m.data
         ELSE json_object('time', json_extract(m.data, '$.time')) END
  ELSE json_object('time', json_extract(m.data, '$.time')) END
ELSE json_object('k', 'invalid') END`;

/** A step without its provider state or snapshot, its content the step's items from `slim_items`. */
function assistantData(): string {
  return `json_set(json_remove(m.data, '$.providerState', '$.snapshot', '$.content'), '$.content',
  json((SELECT json_group_array(json(s.item)) FROM slim_items s WHERE s.seq = m.seq)))`;
}

/** One content item of `items`, keeping its index as `_i`. */
function item(outputLimit: number): string {
  return `CASE WHEN v IS NULL THEN json_object('_i', i) ELSE CASE json_extract(v, '$.type')
  WHEN 'text' THEN json_object('_i', i, 'type', 'text',
    'text', substr(json_extract(v, '$.text'), 1, 65536),
    'n', length(json_extract(v, '$.text')),
    'phase', coalesce(json_extract(v, '$.state.phase'), json_extract(v, '$.state.openai.phase')))
  WHEN 'reasoning' THEN json_object('_i', i, 'type', 'reasoning',
    'text', substr(json_extract(v, '$.text'), 1, 65536),
    'n', length(json_extract(v, '$.text')),
    'time', json_extract(v, '$.time'))
  WHEN 'tool' THEN json_object('_i', i, 'type', 'tool',
    'id', json_extract(v, '$.id'), 'name', json_extract(v, '$.name'),
    'status', json_extract(v, '$.state.status'),
    'input', json(${TOOL_INPUT}),
    'error', json_extract(v, '$.state.error'),
    'meta', json(${TOOL_METADATA}),
    'out', substr(out, 1, ${outputLimit}),
    'outN', length(out),
    'time', json_extract(v, '$.time'))
  ELSE json_object('_i', i, 'type', json_extract(v, '$.type')) END END`;
}

/** A tool call's output texts joined by newlines, from an `items` row. */
const TOOL_OUTPUT = `(SELECT group_concat(json_extract(o.value, '$.text'), char(10))
   FROM json_each(CASE WHEN c.type = 'object' THEN c.value END, '$.state.content') o
  WHERE o.type = 'object')`;

/** The files a tool call changed, from an `items` row, each patch cut at 64 Ki characters. */
const CHANGED_FILES = `(SELECT json_group_array(json_object(
    'file', coalesce(json_extract(f.value, '$.file'), json_extract(f.value, '$.relativePath'),
                     json_extract(f.value, '$.filePath')),
    'status', coalesce(json_extract(f.value, '$.status'), json_extract(f.value, '$.type')),
    'additions', json_extract(f.value, '$.additions'),
    'deletions', json_extract(f.value, '$.deletions'),
    'patch', substr(coalesce(json_extract(f.value, '$.patch'), json_extract(f.value, '$.diff')),
                    1, 65536)))
   FROM json_each(CASE WHEN c.type = 'object' THEN c.value END, '$.state.metadata.files') f
  WHERE f.type = 'object')`;

/** An input of 8 KiB or less whole; a larger one keeps the fields a row names; a text input as a string. */
const TOOL_INPUT = `CASE json_type(v, '$.state.input')
  WHEN 'object' THEN
    CASE WHEN length(CAST(json_extract(v, '$.state.input') AS BLOB)) <= 8192
      THEN json_extract(v, '$.state.input')
      ELSE json_object('filePath', json_extract(v, '$.state.input.filePath'),
        'path', json_extract(v, '$.state.input.path'),
        'command', substr(json_extract(v, '$.state.input.command'), 1, 2048),
        'pattern', json_extract(v, '$.state.input.pattern'),
        'description', json_extract(v, '$.state.input.description'),
        'url', json_extract(v, '$.state.input.url'),
        'query', json_extract(v, '$.state.input.query'),
        'agent', json_extract(v, '$.state.input.agent'),
        'prompt', substr(json_extract(v, '$.state.input.prompt'), 1, 2048),
        'questions', json_extract(v, '$.state.input.questions')) END
  WHEN 'text' THEN json_quote(substr(json_extract(v, '$.state.input'), 1, 2048))
  END`;

/** Tool metadata without diagnostics, previews, full output or file contents; the diff cut at 64 Ki characters, and `files` from `items`. */
const TOOL_METADATA = `CASE WHEN json_type(v, '$.state.metadata') = 'object' THEN json_replace(
  json_remove(json_extract(v, '$.state.metadata'), '$.diagnostics', '$.preview',
    '$.output', '$.loaded', '$.filediff.before', '$.filediff.after'),
  '$.diff', substr(json_extract(v, '$.state.metadata.diff'), 1, 65536),
  '$.files', json(files)) END`;

function userData(): string {
  return `json_object('text', substr(json_extract(m.data, '$.text'), 1, 262144),
  'n', length(json_extract(m.data, '$.text')),
  'files', json(coalesce((SELECT json_group_array(json_object('name', json_extract(f.value, '$.name'),
        'mime', json_extract(f.value, '$.mime'), 'mention', json_extract(f.value, '$.mention')))
      FROM json_each(m.data, '$.files') f WHERE f.type = 'object'), '[]')),
  'agents', json_extract(m.data, '$.agents'),
  'time', json_extract(m.data, '$.time'))`;
}

/** The `json_object` arguments shared by synthetic, system and skill rows. */
function noteArguments(): string {
  return `'text', substr(json_extract(m.data, '$.text'), 1, 16384),
      'n', length(json_extract(m.data, '$.text')),
      'description', json_extract(m.data, '$.description'),
      'metadata', json(CASE WHEN json_type(m.data, '$.metadata') = 'object' THEN json_object(
        'source', json_extract(m.data, '$.metadata.source'),
        'childID', json_extract(m.data, '$.metadata.childID'),
        'state', json_extract(m.data, '$.metadata.state'),
        'exit', json_extract(m.data, '$.metadata.exit'),
        'notice', json_extract(m.data, '$.metadata.notice'),
        'jobID', json_extract(m.data, '$.metadata.jobID'),
        'shellID', json_extract(m.data, '$.metadata.shellID'),
        'truncated', json_extract(m.data, '$.metadata.truncated')) END),
      'time', json_extract(m.data, '$.time')`;
}
