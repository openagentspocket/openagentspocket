# 0025. Usage providers: one registry, one collector per provider

Status: accepted (2026-11-05)

## Decision

The compact Usage view is one card per provider, built from a provider registry; a new provider is a
file on each side, never a UI branch.

- **App** (`packages/core/src/usage/providers`): `UsageProvider { id, displayName, brand }` (`id` is the
  `program` id the plugin's report carries; `brand` is a `ProgramBrand`, the token behind its logo and bar
  color). One file per provider plus one line in `builtin.ts`. `providerUsage(readings, now, translate)`
  returns `ProviderUsage { provider, hostId, hostName, windows: ProviderLimitWindow[] { label, usedShare,
  resetsAt, elapsedShare }, updatedAt, state, note }` per (Host, registered provider), reusing
  `quickContent` (scope, staleness, expiry, window names, pace). A program with no registered provider is
  not shown; registering one makes it appear on every Host that reports it.
- **UI** (`packages/ui`): `ProviderUsageCard` (mark, name, Host, chevron, rows), `LimitWindowRow`
  (10-segment bar), `ProviderUsageFooter`. Bars take `programTint(brand)`; nothing names a provider.
- **Plugin** (`packages/plugin/src/usage/providers`): `COLLECTORS` in `index.js`, one module per provider:
  `{ program, needs, cadenceMs, collect({ runtime, configDir, directory }) -> UsageLimits | null }`.
  The worker runs due collectors after Codex's read, stores them in `limits.json` and the snapshot, and
  `reportFromSnapshot` appends each as a limits-only `programs[]` entry (`tokenUsage.state =
  unavailable/notTracked`, so the token screens ignore it). `collect` returns null when the provider is
  absent or not configured: no card. Claude Code and Codex stay built in the worker (their reads are tied
  to Transcripts and the herdr/Codex processes); they reach the app through the same `programs[]` shape.
- **Secrets**: never in the app or the repo. A provider that needs one reads it on the Host from a file
  named in `providers.json` in the plugin's config directory (`{ "hermes": { "apiKeyFile": "/abs/path" } }`).
  The file must be absolute, a regular file with no group/other permission bits, at most 512 bytes
  (`readSecretFile`); the value is never logged or placed in a report.

## Research: which providers can be read

| Provider | Source | Secret | Windows | Status |
|---|---|---|---|---|
| Claude Code | `claude` CLI limits read, in-server on macOS | none (CLI's own sign-in; opt-in per device) | 5-hour, weekly, per-model weekly | works |
| Codex | `codex app-server` `account/rateLimits/read`, or the last session's `token_count` event | none | primary (5-hour), secondary (weekly) | works |
| Hermes (OpenRouter) | `GET https://openrouter.ai/api/v1/key` (bearer): `limit`, `limit_remaining`, `limit_reset`, `usage_daily/weekly/monthly`, `free_model_daily_requests` | Host's OpenRouter API key | credit limit with its reset period (daily/weekly/monthly, UTC), free-model requests per UTC day | stub: parser done and tested (`openRouterWindows`), key file reader done; the request is not wired |
| OpenCode Go | opencode.ai console only; a GitHub issue says no CLI or API exposes usage. Docs list a rolling 5-hour, weekly and monthly allowance (dollar caps in older docs, percentages of the monthly cap in newer ones; verify before relying) | console session (cookie) | 5-hour, weekly, monthly | stub, reports nothing; needs a supported source first |
| Gemini CLI | `/stats` inside a session shows quota; Google documents daily request caps by sign-in (for example 1,000/day with a personal Google account) | none, but no non-interactive source found | one daily request window | stub, reports nothing |
| Grok, Cursor | not researched to a source. Cursor's usage page works from a logged-in browser session (cookie) | session or key | unknown | stubs, report nothing |

Findings are from vendor docs read on 2026-11-05; nothing here was verified against a live account.
No provider beyond Claude and Codex is readable without a new secret or an unsupported scrape.

## Wiring a stub

Replace `stubCollector("<program>", ...)` in `COLLECTORS` with a module exporting a collector, read its key
through `readProviderConfig` and `readSecretFile`, return windows in the report's `usageLimits` shape
(`{ id, label, durationMinutes, usedPercent, resetsAt, expired }`), and add `<program>` to `builtin.ts` in
core if it is not there (Hermes and OpenCode Go are). A plugin release carries it; older plugins simply do
not report the program.
