#!/usr/bin/env node
// "Spacing and type from tokens": no numeric padding, margin, gap or fontSize in app or UI source.
// Spacing comes from `t.spacing` / `airy`, sizes from a Text variant or `typography`. A real design
// value no token names is listed below, with its reason.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// `padding: 12`, `marginTop: -4`, `gap: 6`, `fontSize: 13`; zero is not a design value.
const NUMBER = String.raw`\s*:\s*-?(?!0\b)\d+(?:\.\d+)?\s*(?:[,})]|$)`;
const LITERAL = new RegExp(
  String.raw`\b(?:(?:padding|margin|gap|rowGap|columnGap)[A-Za-z]*|fontSize)${NUMBER}`,
);

/** The scales themselves. */
const SCALES = new Set(['packages/ui/src/theme/metrics.ts', 'packages/ui/src/theme/typography.ts']);

/** [file, literal, reason]: sizes no token names. */
const ALLOWED = [
  [
    'packages/ui/src/components/PaneSnapshot.tsx',
    'fontSize: 7',
    'a terminal shrunk to a thumbnail',
  ],
  ['packages/ui/src/components/UsageRing.tsx', 'fontSize: 9', 'the percent inside a 28 pt ring'],
  ['packages/ui/src/components/LargeTitleBar.tsx', 'fontSize: 26', 'a long large title steps down'],
  ['packages/ui/src/components/UsageTotals.tsx', 'fontSize: 44', 'the Usage hero figure'],
  ['apps/mobile/src/usage/UsageWide.tsx', 'fontSize: 56', 'the wide Usage hero figure'],
  [
    'packages/ui/src/components/BackgroundWorkList.tsx',
    'paddingLeft: 38',
    'Agents indent under the title',
  ],
  [
    'packages/ui/src/gallery/components/blockedTerminal.tsx',
    'paddingTop: 190',
    'room above a lifted demo',
  ],
];

const SKIP = /\.test\.|\.generated\./;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (/\.tsx?$/.test(path)) yield path;
  }
}

const failures = [];
for (const top of ['apps/mobile/src', 'packages/ui/src']) {
  for (const file of walk(join(ROOT, top))) {
    const path = relative(ROOT, file);
    if (SKIP.test(path) || SCALES.has(path)) continue;
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, index) => {
        const code = line.replace(/\/\/.*$/, '');
        if (!LITERAL.test(code)) return;
        if (ALLOWED.some(([where, literal]) => where === path && code.includes(literal))) return;
        failures.push(`${path}:${index + 1}: ${line.trim()}`);
      });
  }
}

if (failures.length > 0) {
  console.error(
    `Spacing/type literal rule failed (use t.spacing, airy, a Text variant or typography):\n  ${failures.join('\n  ')}`,
  );
  process.exit(1);
}
