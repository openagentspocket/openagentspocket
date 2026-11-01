import { test, suite } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  OPTION_LABEL_LIMIT,
  OPTIONS_LIMIT,
  PROMPT_LIMIT,
  answerRole,
  approvalEpisodeId,
  approvalScope,
  extractApprovalPreview,
} from "../src/approval-preview.js";

const vectors = JSON.parse(
  readFileSync(new URL("../test-vectors/approval-preview-v1.json", import.meta.url), "utf8"),
);

suite("shared vectors", () => {
  test("vector file has captured permissions, non-permissions and a screen without options", () => {
    assert.ok(vectors.vectors.filter((v) => v.fixture && v.expected?.act).length >= 6);
    assert.ok(vectors.vectors.some((v) => v.expected?.act === false));
    assert.ok(vectors.vectors.some((v) => v.expected === null));
  });

  for (const vector of vectors.vectors) {
    test(`extracts: ${vector.name}`, () => {
      assert.deepEqual(extractApprovalPreview(vector.screen), vector.expected);
    });
  }

  test("every vector stays inside the envelope's limits", () => {
    for (const { expected } of vectors.vectors.filter((v) => v.expected !== null)) {
      assert.ok(expected.q.length <= PROMPT_LIMIT);
      assert.ok(expected.opts.length <= OPTIONS_LIMIT);
      for (const label of expected.opts) assert.ok(label.length <= OPTION_LABEL_LIMIT);
    }
  });
});

suite("extractApprovalPreview", () => {
  test("non-text input yields null", () => {
    assert.equal(extractApprovalPreview(undefined), null);
    assert.equal(extractApprovalPreview(42), null);
  });

  test("a numbered list in the transcript above the dialog does not count", () => {
    const screen = [
      "⏺ Plan:",
      "  1. Create the file",
      "  2. Check it",
      "",
      "─".repeat(40),
      " Bash command",
      " touch a.txt",
      " Do you want to proceed?",
      " ❯ 1. Yes",
      "   2. No",
    ].join("\n");
    const preview = extractApprovalPreview(screen);
    assert.deepEqual(preview.opts, ["Yes", "No"]);
    assert.equal(preview.act, true);
  });

  test("a single option is no approval", () => {
    const screen = ["Proceed?", "❯ 1. Yes"].join("\n");
    assert.equal(extractApprovalPreview(screen).act, false);
  });

  test("labels lose their key hint and their description", () => {
    const screen = [
      "Run it?",
      "› 1. Yes, proceed (y)",
      "  2. Yes, and switch to auto mode · auto mode handles these prompts",
      "  3. No, and tell Codex what to do differently (esc)",
    ].join("\n");
    assert.deepEqual(extractApprovalPreview(screen).opts, [
      "Yes, proceed",
      "Yes, and switch to auto mode",
      "No, and tell Codex what to do different…",
    ]);
  });

  test("only the first four labels ride along", () => {
    const rows = ["Pick one", ...[1, 2, 3, 4, 5].map((n) => `  ${n}. Option ${n}`)];
    assert.equal(extractApprovalPreview(rows.join("\n")).opts.length, OPTIONS_LIMIT);
  });

  // The envelope counts UTF-16 code units; an emoji is two. A cut by code
  // points let an emoji-heavy prompt fail the envelope and kill the push.
  test("a prompt of emoji is cut to the envelope's UTF-16 budget, never inside one", () => {
    const screen = [`echo ${"🎉".repeat(200)}`, "Do you want to proceed?", "❯ 1. Yes", "  2. No"].join("\n");
    const { q } = extractApprovalPreview(screen);
    assert.ok(q.length <= PROMPT_LIMIT, `${q.length} code units`);
    assert.ok(q.endsWith("🎉…"));
    // No lone surrogate: every emoji kept is whole.
    assert.equal(Buffer.from(q, "utf8").toString("utf8"), q);
  });

  test("an emoji label is cut by UTF-16 code units too", () => {
    const screen = ["Proceed?", `❯ 1. Yes ${"👍".repeat(30)}`, "  2. No"].join("\n");
    const [label] = extractApprovalPreview(screen).opts;
    assert.ok(label.length <= OPTION_LABEL_LIMIT, `${label.length} code units`);
    assert.ok(label.endsWith("👍…"));
  });

  test("a family emoji is kept whole or dropped whole", () => {
    const family = "👨‍👩‍👧";
    const screen = [`${"a".repeat(236)}${family}tail`, "❯ 1. Yes", "  2. No"].join("\n");
    const { q } = extractApprovalPreview(screen);
    assert.equal(q, `${"a".repeat(236)}…`);
  });

  test("a prompt without text above the options yields null", () => {
    assert.equal(extractApprovalPreview(["─".repeat(20), "❯ 1. Yes", "  2. No"].join("\n")), null);
  });
});

suite("approvalScope", () => {
  const preview = (q, opts = ["Yes", "No"]) => ({ q, opts, act: true });

  test("a command, a fetch or a read offers Approve and Deny", () => {
    for (const vector of vectors.vectors.filter((v) => v.expected?.act)) {
      const expected = /edit|edits/u.test(vector.expected.q) ? "deny" : "approve";
      assert.equal(approvalScope(vector.expected), expected, vector.name);
    }
  });

  test("an edit, a new file or a patch is Deny only: it shows a path, not what it writes", () => {
    for (const q of [
      "1 -probe 1 +probe2 Do you want to make this edit to q.txt?",
      "notes.txt Do you want to create notes.txt?",
      "Do you want to overwrite notes.txt?",
      "Would you like to make the following edits? Destination: /tmp/patch.txt",
    ]) {
      assert.equal(approvalScope(preview(q)), "deny", q);
    }
  });

  test("an invisible format character anywhere is Deny only", () => {
    for (const character of ["\u202E", "\u2066", "\u200B", "\u200D", "\uFEFF", "\u00AD"]) {
      assert.equal(approvalScope(preview(`rm -rf ./bu${character}ild Do you want to proceed?`)), "deny");
      assert.equal(approvalScope(preview("ls Do you want to proceed?", [`Yes${character}`, "No"])), "deny");
    }
  });

  test("no hint, no buttons", () => {
    assert.equal(approvalScope(null), null);
    assert.equal(approvalScope({ q: "Which size?", opts: ["Small", "Large"], act: false }), null);
  });
});

suite("answerRole", () => {
  test("a plain Yes approves and a No declines", () => {
    for (const label of ["Yes", "Yes, proceed", "yes"]) assert.equal(answerRole(label), "approve", label);
    for (const label of ["No", "No, and tell Claude what to do differen…", "No, and tell Codex what to do different…"]) {
      assert.equal(answerRole(label), "decline", label);
    }
  });

  test("a Yes that keeps allowing or switches modes is never an answer", () => {
    for (const label of [
      "Yes, and don't ask again for npm test c…",
      "Yes, and don\u2019t ask again for this",
      "Yes, and always allow access to /privat…",
      "Yes, and switch to auto mode",
      "Yes, and switch to accept edits (auto-a…",
      "Yes, allow all edits during this session",
      "Yes, and don't ask again for commands t…",
      "Type something.",
      "Chat about this",
    ]) {
      assert.equal(answerRole(label), null, label);
    }
  });
});

suite("approvalEpisodeId", () => {
  test("is 8 bytes of base64url, stable for one episode", () => {
    const id = approvalEpisodeId("w1:p2", 1753305600);
    assert.match(id, /^[A-Za-z0-9_-]{11}$/u);
    assert.equal(approvalEpisodeId("w1:p2", 1753305600), id);
  });

  test("differs for another transition or another pane", () => {
    const id = approvalEpisodeId("w1:p2", 1753305600);
    assert.notEqual(approvalEpisodeId("w1:p2", 1753305601), id);
    assert.notEqual(approvalEpisodeId("w1:p3", 1753305600), id);
  });

  test("separates the pane from the timestamp", () => {
    // Without the NUL, `w1:p2` at 11 and `w1:p21` at 1 would collide.
    assert.notEqual(approvalEpisodeId("w1:p2", 11), approvalEpisodeId("w1:p21", 1));
  });
});
