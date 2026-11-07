// The SQL behind each Hermes Agent query (ADR 0025). Every statement reads one session from
// `sessions` and `messages`, and nothing writes. The limits of `opencode/probe-sql.ts` hold here too:
// SQLite 3.25 with JSON1, no `;` inside a statement, no line starting with `.`, and a JSON value that
// crosses a CTE column goes through `json()` before it embeds.
//
// A conversation is what Hermes itself paints: one row per display slot (`display_order`, or the id
// of a row Hermes has not indexed yet), live or archived by compaction, never a row undone or kept
// for the model alone. Inside a slot the live row wins, except that a compaction summary carried in
// another message's slot never replaces that message. A row's `seq` is its slot.
//
// Hermes rewrites rows in place without marking which, so the event counter is the newest row id and
// the generation is `transcript_revision` (bumped by a trigger on every rewrite) with the number of
// inactive rows (`/undo` and compaction flip `active`, which the trigger does not watch).
//
// `messages.content` starts with `\x00json:` when it holds parts rather than text, and SQLite's text
// functions stop at that NUL, so the prefix is read through a BLOB.

import type { StorePollCursor, StoreQuery } from '../store/query';
import { VERSION_STATEMENT } from '../store/script';

/** Characters of a message's text. */
export const TEXT_LIMIT = 262_144;
/** Characters of a tool's result on ordinary reads. */
export const TOOL_OUTPUT_LIMIT = 16_384;
/** Characters of a message's reasoning. */
export const REASONING_LIMIT = 16_384;
/** Characters of one tool call's arguments. */
export const ARGUMENTS_LIMIT = 8_192;

/** Every column the queries name, so a changed layout reads as one problem rather than as the first statement that fails. */
export const LAYOUT_STATEMENT = `WITH need(t, c) AS (VALUES
  ('sessions','id'),('sessions','parent_session_id'),('sessions','title'),('sessions','display_name'),
  ('sessions','model'),('sessions','transcript_revision'),('sessions','end_reason'),('sessions','source'),('sessions','model_config'),
  ('messages','id'),('messages','session_id'),('messages','role'),('messages','content'),
  ('messages','tool_call_id'),('messages','tool_calls'),('messages','tool_name'),
  ('messages','timestamp'),('messages','finish_reason'),('messages','reasoning'),
  ('messages','reasoning_content'),('messages','_compressed_summary'),('messages','active'),
  ('messages','compacted'),('messages','display_kind'),('messages','display_metadata'),
  ('messages','display_order'),('messages','message_uid'))
SELECT 'L ' || m FROM (SELECT group_concat(t || '.' || c, ',') AS m FROM need
  WHERE NOT EXISTS (SELECT 1 FROM pragma_table_info(need.t) p WHERE p.name = need.c))
 WHERE m IS NOT NULL`;

const counter = (session: string) =>
  `coalesce((SELECT max(id) FROM messages WHERE session_id = ${session}), 0)`;

const generation = (session: string) =>
  `(coalesce((SELECT transcript_revision FROM sessions WHERE id = ${session}), 0) || '.' ||
   (SELECT count(*) FROM messages WHERE session_id = ${session} AND active = 0))`;

/** Whether the store moved since the cursor's read. */
function changedSince(session: string, cursor: StorePollCursor): string {
  if (cursor.eventSeq === null) return '1';
  return `(${counter(session)} IS NOT ${cursor.eventSeq} OR ${generation(session)} IS NOT '${cursor.generation ?? ''}')`;
}

const isForDisplay = (alias: string) =>
  `coalesce(json_extract(CASE WHEN json_valid(${alias}.display_metadata) THEN ${alias}.display_metadata END, '$.model_only'), 0) = 0`;

/** Keeps a segment's slots apart from the next one's: each numbers its own rows. */
const SEGMENT_SPAN = 1_000_000_000_000;

/** A row's place in the whole conversation; the oldest segment keeps its own numbers. */
const SLOT = `coalesce(m.display_order, m.id) + ((SELECT max(depth) FROM ln) - ln.depth) * ${SEGMENT_SPAN}`;

/** A branch, delegate or tool child keeps its own copy of the conversation: it is no continuation. */
const isContinuation = `c.source IS NOT 'tool' AND NOT (json_valid(c.model_config) AND p.id IN (
    coalesce(json_extract(c.model_config, '$._branched_from'), ''),
    coalesce(json_extract(c.model_config, '$._delegate_from'), '')))`;

/** Rotation clones the live tail into the child: a row with a copy in a later segment shows there. */
const isClonedForward = `ln.depth > 0 AND EXISTS (SELECT 1 FROM messages k
    JOIN ln l ON l.id = k.session_id AND l.depth < ln.depth
   WHERE k.message_uid = m.message_uid OR (k.role = m.role AND k.timestamp = m.timestamp
     AND k.content IS m.content))`;

/**
 * The session and the segments compression rotated it out of, as Hermes's own resume walks them:
 * a parent counts only when it ended in `compression`, not a branch or a fork of it.
 */
const lineage = (session: string) => `ln(id, depth) AS (SELECT ${session}, 0
  UNION ALL SELECT p.id, ln.depth + 1 FROM ln
    JOIN sessions c ON c.id = ln.id
    JOIN sessions p ON p.id = c.parent_session_id AND p.end_reason = 'compression'
   WHERE ln.depth < 100 AND ${isContinuation})`;

/**
 * The CTEs `v` and `d`: the session's display rows matching `bound`, one per slot, with what each
 * costs to read. A tool result compaction carried forward as a stub is painted once, as its archived
 * original.
 */
function displayed(session: string, bound: string): string {
  return `${lineage(session)},
v AS (SELECT m.id, ${SLOT} AS slot, m.active,
    m._compressed_summary AS summary,
    min(coalesce(length(CAST(m.content AS BLOB)), 0), ${TEXT_LIMIT}) + coalesce(length(m.tool_calls), 0) AS len
  FROM messages m JOIN ln ON ln.id = m.session_id
 WHERE 1${bound}
   AND (m.active = 1 OR m.compacted = 1)
   AND NOT (${isClonedForward})
   AND coalesce(m.display_kind, '') <> 'hidden'
   AND ${isForDisplay('m')}
   AND NOT (m.role = 'tool' AND m.message_uid IS NOT NULL AND EXISTS (
     SELECT 1 FROM messages o WHERE o.session_id = m.session_id AND o.timestamp = m.timestamp
        AND o.message_uid = m.message_uid AND o.role = 'tool' AND o.active = 0 AND o.compacted = 1
        AND o.display_order < m.display_order AND ${isForDisplay('o')}))),
d AS (SELECT slot, id, len FROM (SELECT slot, id, len, row_number()
    OVER (PARTITION BY slot ORDER BY summary, active DESC, id DESC) AS pick FROM v) WHERE pick = 1)`;
}

/**
 * The CTEs that decode the rows of `x`, which the caller has chosen, into `r`: `tx` the message's
 * text, `img` its images, `tc` its tool calls in one shape, whichever API wrote them.
 */
const DECODED = `b AS (SELECT x.*, m.role, m.content, m.tool_call_id, m.tool_calls, m.tool_name, m.timestamp,
    m.finish_reason, m.reasoning, m.reasoning_content, m._compressed_summary, m.display_kind,
    CAST(m.content AS BLOB) AS raw
  FROM x JOIN messages m ON m.id = x.id),
p AS (SELECT *, CASE WHEN hex(substr(raw, 1, 6)) = '006A736F6E3A'
    THEN CAST(substr(raw, 7) AS TEXT) END AS parts FROM b),
t AS (SELECT *, CASE WHEN json_valid(parts) THEN json_type(parts) END AS shape FROM p),
r AS (SELECT *,
    CASE WHEN parts IS NULL THEN CAST(content AS TEXT)
         WHEN shape IS NULL THEN parts
         WHEN shape = 'text' THEN json_extract(parts, '$')
         WHEN shape = 'object' THEN json_extract(parts, '$.text')
         WHEN shape = 'array' THEN (SELECT group_concat(
             CASE j.type WHEN 'text' THEN j.value
                         WHEN 'object' THEN json_extract(j.value, '$.text') END, char(10))
           FROM json_each(parts) j) END AS tx,
    CASE WHEN shape = 'array' THEN (SELECT count(*) FROM json_each(parts) j WHERE j.type = 'object'
        AND json_extract(j.value, '$.type') IN ('image', 'image_url', 'input_image'))
      ELSE 0 END AS img,
    CASE WHEN json_valid(tool_calls) THEN CASE json_type(tool_calls) WHEN 'array' THEN
      (SELECT json_group_array(json_object(
          'id', coalesce(json_extract(c.value, '$.id'), json_extract(c.value, '$.call_id')),
          'name', coalesce(json_extract(c.value, '$.function.name'), json_extract(c.value, '$.name')),
          'args', substr(coalesce(json_extract(c.value, '$.function.arguments'),
                                  json_extract(c.value, '$.arguments')), 1, ${ARGUMENTS_LIMIT})))
         FROM json_each(tool_calls) c WHERE c.type = 'object') END END AS tc
  FROM t)`;

function rowObject(toolLimit: number): string {
  return `json_object('k','row','id',CAST(slot AS TEXT),'seq',slot,'tu',0,'f',json('true'),
    'role',role,'c',substr(tx, 1, CASE role WHEN 'tool' THEN ${toolLimit} ELSE ${TEXT_LIMIT} END),
    'n',length(tx),'img',img,'tc',json(tc),'tid',tool_call_id,'tool',tool_name,'ts',timestamp,
    'fin',finish_reason,
    'rs',substr(CAST(coalesce(reasoning, reasoning_content) AS TEXT), 1, ${REASONING_LIMIT}),
    'kind',display_kind,'sum',_compressed_summary)`;
}

/** The newest display rows below `below` that fit `budget`, oldest first. */
function newestRows(session: string, below: number | null, budget: number): string {
  const bound = below === null ? '' : ` AND ${SLOT} < ${below}`;
  return `WITH RECURSIVE ${displayed(session, bound)},
w AS (SELECT *, sum(len) OVER (ORDER BY slot DESC ROWS UNBOUNDED PRECEDING) AS acc FROM d),
x AS (SELECT slot, id FROM w WHERE acc - len < ${budget}),
${DECODED}
SELECT 'R ' || ${rowObject(TOOL_OUTPUT_LIMIT)} FROM r ORDER BY slot`;
}

const firstStatement = (session: string, changed: string) =>
  `WITH RECURSIVE ${displayed(session, '')}
SELECT 'F ' || coalesce(min(slot), '') FROM d WHERE ${changed}`;

function sessionStatement(session: string, changed: string): string {
  return `SELECT 'S ' || json_object('k','session','id',id,'parent',parent_session_id,
  'title',substr(coalesce(title, display_name), 1, 512),'model',model)
  FROM sessions WHERE id = ${session} AND ${changed}`;
}

export function hermesStatements(query: StoreQuery): string[] {
  const session = `'${query.session}'`;
  const statements = [
    VERSION_STATEMENT,
    LAYOUT_STATEMENT,
    `SELECT 'E ' || ${counter(session)} || ' ' || ${generation(session)}`,
    `SELECT 'M' WHERE NOT EXISTS (SELECT 1 FROM sessions WHERE id = ${session})`,
  ];
  const kind = query.query;
  switch (kind.kind) {
    case 'tail':
      statements.push(
        sessionStatement(session, '1'),
        newestRows(session, null, kind.budget),
        firstStatement(session, '1'),
      );
      break;
    case 'poll': {
      const { cursor } = kind;
      const changed = changedSince(session, cursor);
      statements.push(
        sessionStatement(session, changed),
        // The rows past the window that start inside the budget, then `X` for the first that does
        // not. Hermes only appends past it: anything else moves the generation or the count.
        `WITH RECURSIVE ${displayed(session, ` AND ${SLOT} > ${cursor.highSeq}`)},
w AS (SELECT *, sum(len) OVER (ORDER BY slot ROWS UNBOUNDED PRECEDING) AS acc,
             sum(len) OVER (ORDER BY slot ROWS BETWEEN UNBOUNDED PRECEDING AND 2 PRECEDING) AS previous_start
        FROM d WHERE ${changed}),
x AS (SELECT slot, id, acc, len FROM w WHERE coalesce(previous_start, 0) < ${cursor.budget}),
${DECODED}
SELECT CASE WHEN acc - len < ${cursor.budget} THEN 'R ' || ${rowObject(TOOL_OUTPUT_LIMIT)}
            ELSE 'X' END
  FROM r ORDER BY slot`,
        firstStatement(session, changed),
        `WITH RECURSIVE ${displayed(session, '')}
SELECT 'C ' || count(*) FROM d WHERE slot BETWEEN ${cursor.lowSeq} AND ${cursor.highSeq} AND ${changed}`,
      );
      break;
    }
    case 'older':
      statements.push(newestRows(session, kind.before, kind.budget), firstStatement(session, '1'));
      break;
    case 'row':
      statements.push(`WITH RECURSIVE ${displayed(session, ` AND ${SLOT} = ${kind.seq}`)},
x AS (SELECT slot, id FROM d),
${DECODED}
SELECT 'R ' || ${rowObject(Math.max(0, kind.outputLimit))} FROM r`);
      break;
  }
  return statements;
}
