# How agents build agentico-app

The operating manual for the agent swarm porting Agentico from Swift to React
Native. Distilled from how Anthropic, OpenAI and Cursor run long agent teams:

- Anthropic, [Building a C compiler with a team of parallel Claudes](https://www.anthropic.com/engineering/building-c-compiler):
  near-perfect tests as the oracle (and a known-good reference to compare
  against), short greppable output, progress files every agent keeps current,
  specialized roles (one dedupes, one documents), a gate that blocks breaking
  what works.
- Anthropic, [How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system):
  a lead orchestrates; workers get a self-contained task, an output format and
  a fresh context; parallelism pays only where tasks don't depend on each other.
- OpenAI, [Harness engineering](https://openai.com/index/harness-engineering/):
  a short agent file is a map into `docs/`, the system of record; execution
  plans are checked in with progress and decision logs; rules are enforced
  mechanically; agents review agents.
- Cursor, [Scaling long-running autonomous coding](https://cursor.com/blog/scaling-agents):
  planners, workers and judges; workers never coordinate with each other;
  simple beats clever (locks became the bottleneck); fresh starts beat long
  drifting runs.

## Roles

| Role | Who | Does | Never |
|---|---|---|---|
| Lead | the main session | plans waves from `docs/tasks.yml`, assigns disjoint tasks, integrates branches, runs native builds, the full suite, Maestro, commits and merges, keeps PROGRESS current | writes feature code a worker could write |
| Worker | one subagent per task, own worktree | implements one task to its acceptance, writes tests, commits on its branch, writes `docs/progress/<task>.md` | runs native builds or simulators (unless the task is native), touches files outside its task, coordinates with other workers |
| Native worker | one at a time | Expo Module / native code, holds the native slot, builds and runs on its own device | runs while another native build is running |
| Judge | read-only subagent per finished task | reviews the branch against the task's acceptance, the reuse rule and the Swift reference; verdict ship / fix / redo with reasons | edits code |
| Gardener | periodic read-only subagent | finds duplication, files over budget, stale docs, dead code; files tasks | edits code |

## The loop (one wave)

1. **Plan**: the lead picks the next ready tasks from `docs/tasks.yml`
   (dependencies met, file sets disjoint), at most 6 JS workers + 1 native.
2. **Work**: each worker gets the task id, its acceptance and file set, the
   Swift reference files, and the brief below. Fresh context per task.
3. **Judge**: each finished branch gets an independent judge.
4. **Integrate**: the lead merges ship-verdict branches one at a time onto
   `main`: `pnpm verify-fast`, the related tests, then once per wave the full
   JS suite (seconds, no simulator) and, after native changes, one native
   build per platform plus the Maestro smoke flows. Fix-verdict branches go
   back to a worker with the judge's notes.
5. **Record**: task status in `docs/tasks.yml`, `pnpm progress` regenerates
   `docs/PROGRESS.md` (what is done, what is left, per phase), the roadmap's
   RESUME HERE, lessons in `docs/roadmap.md`.
6. Next wave immediately.

## Oracles (how a worker knows it is done without asking anyone)

- Ported logic: golden JSON exported from the Swift implementation for the
  same inputs (transcripts, Blocked screens, usage reports, pairing codes);
  the TS port must produce the same output. Plugin/relay: their test vectors.
- Screens: the acceptance in `docs/spec/parity.md` (elements, states, copy),
  checked by component tests and a Maestro flow; the Swift app's screenshot
  is a reference for content, not pixels (the look changed on purpose).
- Native: a local OpenSSH fixture (sshd on localhost with a test key and a
  fake herdr socket) proves SSH primitives on simulator and emulator. No
  personal hosts or keys, ever.

## Budgets and rules (enforced by `pnpm verify-fast`)

- Files ≤ 400 lines, screens ≤ 150; colors only from theme tokens; search
  `packages/ui` before writing UI; tests pin behavior, never copy; no GPL code.
- Output for agents: short; failures on one line starting with `ERROR`;
  full logs in files.
- Machine: 1 native build, 2 Metro servers, 1 simulator + 1 emulator at a
  time; JS tests with at most 2 workers each.

## Worker report (`docs/progress/<task-id>.md`, required)

```
# <task-id>: <title>
status: done | partial | blocked
branch: <branch>
changed: <files>
tests: <command> → <passed>/<total>
acceptance: <each criterion: met / not met + evidence>
left: <what remains, as new task suggestions>
notes: <decisions, surprises, anything the next agent needs>
```
