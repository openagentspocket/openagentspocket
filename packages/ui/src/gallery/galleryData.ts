import type { KeySpec } from '../keys/KeyboardDock';
import type { BarDatum } from '../primitives/BarChart';

/** Sample content for the gallery: neutral, no personal hosts or names. */

export const sampleMarkdown = `## Refactor plan

I updated **three files** and left one _open question_. See [the docs](https://example.com).

1. Split \`SessionDriver\` into reader and writer
2. Add tests for the reconnect path
3. Remove the socat fallback

- [x] Reader extracted
- [ ] Writer extracted

> The relay keeps the old path until every Host updates.

\`\`\`ts
export function retry<T>(run: () => Promise<T>, attempts = 3): Promise<T> {
  return run().catch((error) => (attempts > 1 ? retry(run, attempts - 1) : Promise.reject(error)));
}
\`\`\`

| Program | Status |
|---|:-:|
| claude | done |
| codex | working |
`;

export const sampleDiff = `diff --git a/src/session.ts b/src/session.ts
index 3b18e51..a9c2f04 100644
--- a/src/session.ts
+++ b/src/session.ts
@@ -12,7 +12,8 @@ export class Session {
   private readonly channel: Channel;
-  private retries = 0;
+  private retries = 0;
+  private readonly maxRetries = 3;

   async open(): Promise<void> {
-    await this.channel.connect();
+    await this.channel.connect({ timeoutMs: 5000 });
   }
`;

export const sampleTerminal =
  '\x1b[32m$\x1b[0m herdr status\r\n' +
  'workspace  pane  agent   status\r\n' +
  'api        p1    claude  \x1b[33mworking\x1b[0m\r\n' +
  'web        p2    codex   \x1b[31mblocked\x1b[0m\r\n' +
  'docs       p3    pi      \x1b[32mdone\x1b[0m\r\n';

export const sampleKeyRows: KeySpec[][] = [
  [
    { id: 'esc', label: 'esc', accessibilityLabel: 'Escape' },
    { id: 'ctrl', label: 'ctrl', accessibilityLabel: 'Control', modifier: 'ctrl' },
    { id: 'alt', label: 'alt', accessibilityLabel: 'Alt', modifier: 'alt' },
    { id: 'tab', label: 'tab', accessibilityLabel: 'Tab' },
    { id: 'up', label: '↑', icon: 'arrowUp', accessibilityLabel: 'Up arrow' },
    { id: 'down', label: '↓', icon: 'arrowDown', accessibilityLabel: 'Down arrow' },
    { id: 'left', label: '←', icon: 'arrowLeft', accessibilityLabel: 'Left arrow' },
    { id: 'right', label: '→', icon: 'arrowRight', accessibilityLabel: 'Right arrow' },
  ],
  [
    { id: 'c', label: 'c' },
    { id: 'd', label: 'd' },
    { id: 'l', label: 'l' },
    { id: 'r', label: 'r' },
    { id: 'slash', label: '/' },
    { id: 'pipe', label: '|' },
    { id: 'tilde', label: '~' },
  ],
];

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const TOKENS = [42_000, 61_500, 18_200, 77_900, 54_300, 9_800, 31_000];

export const sampleWeek: BarDatum[] = DAYS.map((label, index) => ({
  key: label.toLowerCase(),
  label,
  value: TOKENS[index] ?? 0,
}));

export const sampleMonth: BarDatum[] = Array.from({ length: 30 }, (_, index) => ({
  key: `d${index + 1}`,
  label: String(index + 1),
  value: Math.round(20_000 + 15_000 * Math.sin(index / 3) + (index % 5) * 4_000),
}));

export const compactNumber = (value: number) =>
  value >= 1000 ? `${(value / 1000).toFixed(1)}k tokens` : `${value} tokens`;

export interface SampleAgent {
  id: string;
  name: string;
  program: string;
  workspace: string;
  status: 'blocked' | 'working' | 'done' | 'idle';
}

export const sampleAgents: SampleAgent[] = [
  {
    id: 'p1',
    name: 'Fix flaky reconnect test',
    program: 'claude',
    workspace: 'api',
    status: 'blocked',
  },
  {
    id: 'p2',
    name: 'Port the usage parser',
    program: 'codex',
    workspace: 'core',
    status: 'working',
  },
  { id: 'p3', name: 'Write the pairing docs', program: 'pi', workspace: 'docs', status: 'done' },
  { id: 'p4', name: 'Shell', program: 'zsh', workspace: 'web', status: 'idle' },
];
