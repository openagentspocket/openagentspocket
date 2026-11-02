# 0022: The app is called OpenAgentsPocket

Date: 2026-11-01. Status: accepted (Enzo).

## Context

"Agentico" is crowded: the npm scope `@agentico`, agentico.dev/.app/.io/.com and AI companies use it. The
"phone remote for coding agents" space filled up in weeks (AgentDeck, Agent Remote, Pocket Agent, Corral for
herdr, Moshi), so most descriptive singular names already have a same-niche app. Enzo wanted an English name
that says what the app does, not a metaphor, with "Open" for open source.

## Decision

**OpenAgentsPocket**: your AI coding agents, open source, in your pocket. App Store name "OpenAgentsPocket",
subtitle "Remote for AI coding agents". Checked free on 2026-11-01: GitHub user/org, npm package, App Store
(us/ar/es), and the .com (whois: not registered); .app/.dev/.io had no nameservers. Trademarks (USPTO, EUIPO,
INPI) and the .app/.dev registrations still need a manual check before launch.

## Consequences

- User-facing name, README, store listing and icon move to OpenAgentsPocket. The icon keeps the chosen "solid
  indigo" style with a new mark.
- Internal identifiers (`@agentico/*` workspace packages, the `agentico://` deep-link scheme the plugin
  emits, the `herdr-plugin` id) are renamed in one mechanical task after wave 1 is merged; protocol
  identifiers shared with the plugin change only together with it.
- The bundle id is set when the Apple Developer account is active.

## Icon (Enzo, 2026-11-01)

Style "solid indigo" (gradient #9C8CFF to #8270F5, mark #0B0820, light #F6F6FC) with mark C: three cards
(agents) peeking out of a pocket, which also reads as a little face. Refined for 29-60 px and exported as Expo
assets (iOS icon, Android adaptive foreground/background/monochrome, splash) before the rename task wires them.

