// Approval preview for the notify hook (spec F5, "approve from the
// notification").
//
// When a device opted in with `notify.approve`, the notify hook reads the
// Blocked Agent's visible screen and sends what it shows: the prompt text
// (`q`) and the option labels (`opts`), plus a hint (`act`) that the prompt
// looks like a permission the app may answer. All three are display and
// binding only. The app never trusts them to pick a key: at action time it
// reads the screen again, parses it with its own per-program dialog parser,
// and refuses unless that dialog still shows this `q`.
//
// The extractor reads the numbered layouts Claude Code and Codex draw. Other
// programs' prompts (Oh My Pi's ctrl+q panel, OpenCode's option row, Grok
// Build's radio rows) yield null, so their notifications carry no approval
// fields and keep their plain Blocked alert.
//
// Approve goes only with a request the notification shows whole: a command,
// a URL, a file to read. An edit, a new file or a patch shows only its path,
// and a prompt with invisible format characters (Unicode Cf: bidi overrides,
// isolates, zero-width marks) can read as something it is not, so those are
// Deny only (`approvalScope`). src/approval-apply.js re-checks all of this on
// the Host right before it sends the key.
//
// test-vectors/approval-preview-v1.json pins the extractor; the Swift tests
// check that the app's prompt binding accepts every vector's `q` against its
// real dialog parser output, which keeps the two sides from drifting.

import { createHash } from "node:crypto";

/**
 * The longest `q` in UTF-16 code units, the unit the envelope's length check
 * counts, ellipsis included. Longer prompts end with `…`.
 */
export const PROMPT_LIMIT = 240;
/** The longest option label in UTF-16 code units, ellipsis included. */
export const OPTION_LABEL_LIMIT = 40;
/** At most this many labels, the first ones on screen. */
export const OPTIONS_LIMIT = 4;

// A numbered option row: optional focus pointer (Claude's `❯`, Codex's `›`),
// the number, a period, the label.
const OPTION_ROW = /^(\s*)(?:[❯›>]\s*)?(\d{1,2})\.\s+(\S.*)$/u;
// A full-width rule or a box corner: the edge of a dialog or a panel.
const EDGE_ROW = /^\s*(?:─{3,}|[╭╰┌└].*)\s*$/u;
// Claude's dashed separators around a command or a diff.
const SEPARATOR_ROW = /^\s*╌{3,}\s*$/u;
// Transcript rows above a dialog: tool calls, results, spinners, Codex's
// bullets. The user's own prompt starts with `❯` or `›` and no number.
const TRANSCRIPT_ROW = /^\s*(?:[⏺⎿✻•]|[❯›] (?!\d{1,2}\.))/u;
// The key a label names in parentheses at its end: `(y)`, `(esc)`,
// `(shift+tab)`. The app's parsers move it out of the label too.
const KEY_HINT = /\s*\((?:[a-z]|esc|tab|shift\+tab|ctrl\+[a-z])\)$/iu;

// The hint stays off for rows that only questions, plans and trust prompts
// draw, so their notifications never offer Approve.
const APPROVE_LABEL = /^(?:yes|allow|approve)\b/iu;
const DECLINE_LABEL = /^(?:no|reject|deny|decline)\b/iu;
const NON_PERMISSION_LABEL = /^(?:type something|chat about this)\b|keep planning|trust this folder/iu;
// The labels a notification answers with, as the app's DialogRowScanner
// reads them: a plain Yes or a No, never a Yes that switches the permission
// mode or keeps allowing (the app's mode-switch and persistent phrases).
const YES_LABEL = /^yes(?:$|[, ])/iu;
const NO_LABEL = /^no(?:$|[, ])/iu;
const LASTING_YES =
  /switch to auto mode|switch to accept edits|use auto mode|auto-accept edits|bypass|don't ask again|always allow|for this session|during this session|from this project|allow this host|keep allowing|in the future/iu;
// Requests that show only a path, not what they write: Claude Code's Edit,
// Write and NotebookEdit, and Codex's patch.
const WRITE_PROMPT = /\bDo you want to (?:make this edit to|create|overwrite)\b|\bWould you like to make the following edits\?/u;
// Invisible format characters: bidi overrides and isolates, zero-width marks.
const FORMAT_CHARACTER = /\p{Cf}/u;

const graphemes = new Intl.Segmenter("en", { granularity: "grapheme" });

/** Collapse runs of whitespace into single spaces and trim. */
function collapse(text) {
  return text.replace(/\s+/gu, " ").trim();
}

/**
 * Cut `text` to at most `limit` UTF-16 code units, ellipsis included, at a
 * grapheme boundary, so an emoji is never split and the envelope's own
 * length check, which counts code units, always passes.
 */
function cut(text, limit) {
  if (text.length <= limit) return text;
  let kept = "";
  for (const { segment } of graphemes.segment(text)) {
    if (kept.length + segment.length > limit - 1) break;
    kept += segment;
  }
  return `${kept.trimEnd()}…`;
}

/** An option's label as the card shows it: no description, no key hint. */
function labelText(raw) {
  const withoutDetail = collapse(raw).split(" · ")[0];
  return withoutDetail.replace(KEY_HINT, "").trim();
}

/**
 * The options block the dialog draws: the last run on screen that starts at
 * `1.`. A numbered list in the transcript above (a plan, a reply) comes
 * earlier, so the dialog at the bottom wins.
 *
 * @returns {{start: number, labels: string[]} | null}
 */
function optionsBlock(lines) {
  // Rules span the screen, so the longest row is about its width.
  const width = Math.max(0, ...lines.map((line) => [...line].length));
  // A row continues the one above when the row above could not take its
  // first word: the program wrapped there. A shorter row above means a
  // description row under a label (Claude's questions) instead.
  const wraps = (above, line) =>
    [...above].length + 1 + [...line.trim().split(" ")[0]].length > width;
  for (let start = lines.length - 1; start >= 0; start -= 1) {
    const first = OPTION_ROW.exec(lines[start]);
    if (first === null || first[2] !== "1") continue;
    const labels = [];
    let column = lines[start].length - first[3].length;
    let current = first[3];
    for (let index = start + 1; index < lines.length; index += 1) {
      const line = lines[index];
      const next = labels.length + 2;
      const row = OPTION_ROW.exec(line);
      if (row !== null && Number(row[2]) === next) {
        labels.push(current);
        current = row[3];
        column = line.length - row[3].length;
        continue;
      }
      // Claude rules off a question's last rows (`Chat about this`); the
      // numbering carries on under the rule.
      const after = OPTION_ROW.exec(lines[index + 1] ?? "");
      if (EDGE_ROW.test(line) && after !== null && Number(after[2]) === next) continue;
      const indent = line.length - line.trimStart().length;
      // A wrapped label continues under its first character and a
      // description sits under it or further right; anything else (a blank
      // row, a rule, the footer) ends the block.
      if (line.trim() === "" || EDGE_ROW.test(line) || indent < column) break;
      if (indent === column && wraps(lines[index - 1], line)) current += ` ${line.trim()}`;
    }
    labels.push(current);
    return { start, labels };
  }
  return null;
}

/**
 * The prompt above the options: the paragraph right above the first option
 * and the one before it, skipping blank rows and Claude's dashed
 * separators, stopping at the dialog's edge or the transcript. For Claude's
 * Bash dialog that is the command and `Do you want to proceed?`; for Codex
 * it is the `Reason:` and the `$ command`.
 */
function promptAbove(lines, start) {
  const paragraphs = [];
  let current = [];
  for (let index = start - 1; index >= 0 && paragraphs.length < 2; index -= 1) {
    const line = lines[index];
    if (EDGE_ROW.test(line) || TRANSCRIPT_ROW.test(line)) break;
    if (line.trim() === "" || SEPARATOR_ROW.test(line)) {
      if (current.length > 0) paragraphs.push(current);
      current = [];
      continue;
    }
    current.unshift(line.trim());
  }
  if (current.length > 0 && paragraphs.length < 2) paragraphs.push(current);
  return collapse(paragraphs.reverse().flat().join(" "));
}

/**
 * Extract the approval preview from a Blocked Agent's visible screen, as
 * `herdr agent read <pane> --source visible --format text` prints it.
 *
 * @param {string} screenText the screen's rows, newline separated
 * @returns {{q: string, opts: string[], act: boolean} | null} null when the
 *   screen shows no numbered options or no prompt above them
 */
export function extractApprovalPreview(screenText) {
  if (typeof screenText !== "string") return null;
  const lines = screenText.split(/\r?\n/u).map((line) => line.trimEnd());
  const block = optionsBlock(lines);
  if (block === null) return null;
  const q = promptAbove(lines, block.start);
  if (q.length === 0) return null;
  const labels = block.labels.map(labelText).filter((label) => label.length > 0);
  const opts = labels.slice(0, OPTIONS_LIMIT).map((label) => cut(label, OPTION_LABEL_LIMIT));
  const act =
    labels.length >= 2 &&
    labels.some((label) => APPROVE_LABEL.test(label)) &&
    labels.some((label) => DECLINE_LABEL.test(label)) &&
    !labels.some((label) => NON_PERMISSION_LABEL.test(label));
  return { q: cut(q, PROMPT_LIMIT), opts, act };
}

/**
 * How a notification's answer reads `label`: `"approve"` for a one-time Yes,
 * `"decline"` for a No, null for anything else (an always-allow Yes, a mode
 * switch). The app decides with its own parser and its full labels; the
 * Host checks this too before it presses the option.
 *
 * @param {string} label an option label as the extractor returns it
 * @returns {"approve" | "decline" | null}
 */
export function answerRole(label) {
  const folded = label.replaceAll("\u2019", "'");
  if (NO_LABEL.test(folded)) return "decline";
  if (YES_LABEL.test(folded) && !LASTING_YES.test(folded)) return "approve";
  return null;
}

/**
 * What a notification may offer for `preview`: `"approve"` (Approve and
 * Deny), `"deny"` (Deny only) or null (no buttons). Deny only when the
 * request shows a path instead of what it writes, or when the prompt or a
 * label holds an invisible format character.
 *
 * @param {{q: string, opts: string[], act: boolean} | null} preview
 * @returns {"approve" | "deny" | null}
 */
export function approvalScope(preview) {
  if (preview === null || !preview.act) return null;
  if (WRITE_PROMPT.test(preview.q)) return "deny";
  if ([preview.q, ...preview.opts].some((text) => FORMAT_CHARACTER.test(text))) return "deny";
  return "approve";
}

/**
 * The Blocked episode id (`bid`): the first 8 bytes of SHA-256 over the pane
 * id, a NUL, and the transition's unix-seconds, unpadded base64url. The same
 * episode yields the same id on every device it notifies; the next one, even
 * with an identical prompt, yields another. The app spends each id once.
 *
 * @param {string} paneId
 * @param {number} timestamp unix-seconds of the transition
 * @returns {string}
 */
export function approvalEpisodeId(paneId, timestamp) {
  return createHash("sha256")
    .update(`${paneId}\0${timestamp}`, "utf8")
    .digest()
    .subarray(0, 8)
    .toString("base64url");
}
