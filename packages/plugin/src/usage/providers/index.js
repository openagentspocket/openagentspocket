import { hermesCollector } from "./openrouter.js";
import { stubCollector } from "./stub.js";

/**
 * Every provider beyond Claude Code and Codex (whose readers are tied to their Transcripts and
 * live in the worker). One collector per file, one line here:
 * `{ program, needs, cadenceMs, collect({ runtime, configDir, directory }) -> UsageLimits | null }`.
 * `collect` returns the report's `usageLimits` shape (state, reason, observedAt, plan, windows) or
 * null when the provider is absent or not configured on this Host: then no card is reported.
 */
export const COLLECTORS = [
  hermesCollector,
  stubCollector("opencode-go", "session"),
  stubCollector("gemini", "interactive"),
  stubCollector("grok", "apiKey"),
  stubCollector("cursor", "session"),
];

/**
 * Runs the collectors that are due and returns `{ [program]: { report, nextAllowedAt } }`. A
 * collector keeps its own cadence; one that throws reports a failed reading instead of breaking
 * the run. `previous` is the last result, kept for a collector that is not due.
 */
export async function collectProviderLimits({ runtime, configDir, directory, previous = {}, now = Date.now(), collectors = COLLECTORS }) {
  const result = {};
  for (const collector of collectors) {
    const held = previous[collector.program];
    if (held && Number.isFinite(held.nextAllowedAt) && now < held.nextAllowedAt) { result[collector.program] = held; continue; }
    let report;
    try { report = await collector.collect({ runtime, configDir, directory }); }
    catch { report = { state: "error", reason: "requestFailed" }; }
    if (!report) continue;
    result[collector.program] = { report: { observedAt: new Date(now).toISOString(), ...report }, nextAllowedAt: now + collector.cadenceMs };
  }
  return result;
}
