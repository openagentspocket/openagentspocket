# Swift goldens

The oracle for the TypeScript ports of Chat (transcript reducers) and the
Blocked card (dialog parsers and action planners): what the Swift app
produces for the same captured inputs. A port is done when it produces the
same JSON for every fixture here (differential testing, see
[docs/agents/swarm.md](../../../docs/agents/swarm.md#oracles-how-a-worker-knows-it-is-done-without-asking-anyone)).

Everything in this directory is generated or copied. Never edit it by hand;
regenerate it from the Swift repo instead.

## Provenance

| What | Where it comes from |
|---|---|
| Fixtures (`*.jsonl`, `*.ansi`, OpenCode `store-*.json` and `schema.sql`, `probe2-subagent.meta.json`) | The Agentico Swift repo's `Tests/AgenticoTests/ChatFixtures`, copied byte for byte. [FIXTURES.md](FIXTURES.md) is that directory's README: how and when each capture was made, and how it was scrubbed. |
| Goldens (`*.golden.json`, `*.screen.json`, `manifest.json`) | The Swift repo's opt-in test `GoldenExportTests` (`Tests/AgenticoTests/GoldenExportTests.swift` and `GoldenExportJSON.swift`) |
| Swift commit | Sources and fixtures as on Swift `main` at `a1da791`; the exporter is commit `b63ce74` on the Swift branch `goldens` (based on `a1da791`, changes only test files and the Xcode project). `8b474e3` on the same branch makes it reuse the reducer tests' Grok path and OpenCode lines; a re-export there is byte-identical. |
| Run | 2026-11-01, Xcode 27.2, iPhone 17 Pro simulator (iOS 26.5), `-testLanguage en -testRegion US`. Two runs into two directories were byte-identical. |

License: Apache-2.0 (see [LICENSE](LICENSE) and [NOTICE](NOTICE)); the
fixtures come from a modified Heeler.

## Regenerate

In a checkout of the Swift repo that has `GoldenExportTests`:

```sh
make sim-claim AGENT=goldens                  # prints the clone's SIM_DESTINATION; SIM_UDID=<uuid> if no shared simulator is set
TEST_RUNNER_AGENTICO_EXPORT_GOLDENS=/tmp/goldens make test-app AGENT=goldens \
  SIM_DESTINATION='platform=iOS Simulator,id=<clone UDID>' \
  TEST_FLAGS='-only-testing:AgenticoTests/GoldenExportTests -testLanguage en -testRegion US'
make sim-release AGENT=goldens
```

Then copy, for each program, `ChatFixtures/<program>/*` into
`<program>/transcripts/`, `ChatFixtures/screens/<program>/*` into
`<program>/screens/`, `/tmp/goldens/<program>/` over the same directories,
`/tmp/goldens/manifest.json` here and `ChatFixtures/README.md` to
`FIXTURES.md`, and update the Provenance table. Without the variable the
test passes at once and writes nothing. `-testLanguage en` keeps the
planners' refusal messages in English.

## Layout

```
<program>/transcripts/<fixture>                 input, as captured
<program>/transcripts/<fixture stem>.golden.json the reducer's projections
<program>/screens/<capture>.ansi                 input: an `agent.read` of the screen
<program>/screens/<capture>.golden.json          parsed dialog + planner results
<program>/screens/<capture>.screen.json          the decoded screen
manifest.json                                    counts, activities, plan inputs, language
```

Programs: `claude`, `codex`, `pi`, `omp` (Oh My Pi, read by the Pi reducer),
`grok`, `opencode`. 40 transcript goldens, 217 screen goldens.

`<program>/lab/` is the one exception to "generated from the Swift repo": captures the agent lab
took from the real program (`scripts/agent-lab.py`, see docs/e2e-live-backend.md), `*.ansi`
screens and `store-*.out` store query outputs, with no goldens beside them. Their tests state
what the app must read from them (`src/lab-captures.testkit.ts`). A Swift re-export leaves them alone.

`opencode/constructed/` is not captured at all: rows written by hand in the record source's line
format, shaped after OpenCode's source, for a case no capture holds yet (a background subagent and
its completion rows). Their tests say so (`src/chat/opencode/constructed.testkit.ts`). Replace one
with a lab capture once one exists.

## Transcript goldens

```json
{
  "fixture": "probe2-transcript.jsonl",
  "program": "claude",
  "reducer": { "type": "ClaudeTranscriptReducer", "role": "main" },
  "lineOffsets": [0, 88, 198, ...],
  "unsupportedFormat": null,
  "projections": { "unknown": {...}, "idle": {...}, "working": {...}, "blocked": {...} }
}
```

- The reducer is fed every line of the fixture in one `append`, then
  projected with `ChatProjectionContext(windowStart: 0, activity, skillNames: [])`
  once per activity. Each projection is a `ChatTranscript`.
- `reducer` names the Swift type and its parameters: Claude `role`
  (`subagent` for `probe2-subagent.jsonl`, no `transcriptPath`, so no spilled
  outputs are read); Codex `rolloutID`; Pi `program` (`pi` or `omp`); Grok
  `transcriptPath` (relative paths in the session resolve against the
  directory it encodes); OpenCode none.
- `lineOffsets` is the offset of each line the reducer was fed, in order.
  For every program but OpenCode it is where the line starts in the file
  (the JSONL framer's offset, so it also checks a framer port). OpenCode
  reads rows by query, not by file: a `row` line's offset is its `seq`, and
  the `session` and `inbox` lines sit at `event_seq + 1` from the matching
  `store-<scenario>.json` (`OpenCodeTranscriptReducerTests.lines`). Entry ids
  and `sourceOffset`s derive from these offsets, so a port must feed the
  same ones.
- Most fixtures are finished sessions, so the four projections are usually
  equal; they differ in `grok/pending-permission`, `opencode/rows-question-blocked`,
  `opencode/rows-steer-queued` and `pi/auth-error-skill`.
- `opencode/rows-row-types` records one invalid line on purpose
  (`diagnostics.invalidLines == 1`).

## Screen goldens

```json
{
  "fixture": "claude-02-c1-bash-blocked.ansi",
  "program": "claude",
  "parse": { "dialog": {...} } | { "unrecognized": {...} } | "none",
  "plans": [ ... ]
}
```

- The screen is decoded with `ANSIScreenDecoder.decode` and parsed with the
  program's parser (`BlockedDialogParser.parse`). `parse` is the
  `DialogParseResult`: a `BlockedDialog`, a `GenericDialogExcerpt` (rows
  included) or `"none"`. Pi has no dialog parser, so every `pi` capture is
  `"none"`; many Grok, OMP and OpenCode captures show no dialog either
  (they were captured for the input-box detectors).
- For a dialog, `plans` holds one entry per action a card can ask for:
  `choose`, `amend` (note `Use a dry run first`) and `respond` (text
  `Golden answer`) for every option ordinal, then `choose` one past the
  last option, `approvePlan` (note `Keep it small`), `submitSelection` with
  no ordinal, the first and all checkable ordinals, `dismiss`,
  `expandQuestions` and `skipQuestion` (duplicates dropped). Each entry is
  `{"action", "result"}` with `result` either `{"plan": DialogActionPlan}` or
  `{"error": DialogPlanError}` from `DialogActionPlanner.plan(action, for:)`;
  `resultWithToolUseID` is the result with `toolUseID: "toolu_golden"`, present
  only when it differs (Claude and Oh My Pi confirm by the tool result,
  OpenCode sends Esc only for a matched call).
- For an excerpt, `plans` is `[{"number", "result"}]` for each numbered
  option, from `DialogActionPlanner.plan(number:for:program:)` (the generic
  card's digit buttons).
- `fingerprint.value` (and `requestLines`, `ruleLines`) are lowercase SHA-256
  hex digests: a port matches them only by reproducing `DialogFingerprint`
  exactly (fields normalized with `DialogRowScanner.comparable`, list items
  joined by U+001F, fields by U+001E). Compare the rest first.

`<capture>.screen.json` is the decoded screen, for checking a decoder port on
its own: `columns`, `styles` (each distinct `ScreenStyle` in first-use order)
and `rows`, one per line, each `{"index", "text", "width", "runs"}` with runs
as `[column, width, style index, text]`.

## JSON encoding

The goldens are a reflection of the Swift values (`GoldenExportJSON.swift`),
so they hold every stored property, including ones the types' `Codable`
conformances leave out:

- struct or class: an object of its stored properties, by their Swift names;
- enum case without payload: its raw value (string enums), else its name;
- enum case with payload: `{"case": payload}`; several unlabeled values are an
  array (`{"rgb": [215, 119, 87]}`), labeled ones an object
  (`{"choose": {"ordinal": 1}}`, `{"amend": {"note": "...", "ordinal": 1}}`);
- `RawRepresentable` struct (such as `ChatEntryID`): its raw value;
- optional: the value or `null`; nothing is omitted;
- array: an array; `Set`: an array sorted by each element's JSON text;
  dictionary: an object keyed by the key's text;
- `Date`: ISO 8601 UTC with milliseconds, as `Date.prototype.toISOString()`;
  `Range`: `{"lowerBound", "upperBound"}`;
- keys sorted by UTF-16 code units, two-space indent, as
  `JSON.stringify(value, null, 2)` prints them (`*.screen.json` keeps each row
  and style on one line). Compare parsed values, not text.

A port's types need not match these shapes: map the port's output into this
image in the test, then deep-compare.

This port's image (`src/chat/golden-image.ts`) leaves out what Swift does not
hold: Subagent resumes (Claude Code `SendMessage` continuing an ended agent),
that is `backgroundWorkAgents` on the transcript and `agentID` and `resume` on
each Background Work item. No fixture resumes a Subagent, so the rest of every
projection is still compared.
