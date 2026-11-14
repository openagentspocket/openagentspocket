#!/usr/bin/env node
// "Corners from the scale": every rounded corner in app or UI source comes from `t.radius`
// (mark, chip, control, card, sheet, capsule). A number, or a token nudged by a number
// (`radius.chip + 2`), fails. A corner derived from a shape's own size (`size / 2`, `size * 0.3`) is
// geometry, not a design value, and passes. A real exception is listed below with its reason.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// `borderRadius: 8`, `borderTopLeftRadius: 24`, `cornerRadius={28}`, `radius={8}`.
const KEY = String.raw`\b(?:border[A-Za-z]*Radius|cornerRadius|sheetCornerRadius|radius)`;
const VALUE = new RegExp(String.raw`${KEY}\s*[:=]\s*\{?\s*([^,}\n]+)`);
// `const PANEL_RADIUS = 28`.
const CONSTANT = /\b[A-Z_]*RADIUS\s*=\s*-?\d/;
const NUMBER_FIRST = /^\(?\s*-?\d/;
const NUDGED = /[+-]\s*\d/;

/** The scale itself. */
const SCALES = new Set(['packages/ui/src/theme/metrics.ts']);

/** [file, literal, reason]: corners no token names. */
const ALLOWED = [];

/** The brand mark's geometry is drawn to its own grid, not the UI scale. */
const SKIP = /\.test\.|\.generated\.|\/brand\//;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (/\.tsx?$/.test(path)) yield path;
  }
}

const literal = (code) => {
  if (CONSTANT.test(code)) return true;
  const match = VALUE.exec(code);
  if (!match) return false;
  const value = match[1].trim();
  return NUMBER_FIRST.test(value) || NUDGED.test(value);
};

const failures = [];
for (const top of ['apps/mobile/src', 'packages/ui/src']) {
  for (const file of walk(join(ROOT, top))) {
    const path = relative(ROOT, file);
    if (SKIP.test(path) || SCALES.has(path)) continue;
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, index) => {
        const code = line.replace(/\/\/.*$/, '');
        if (!literal(code)) return;
        if (ALLOWED.some(([where, text]) => where === path && code.includes(text))) return;
        failures.push(`${path}:${index + 1}: ${line.trim()}`);
      });
  }
}

if (failures.length > 0) {
  console.error(
    `Corner radius rule failed (use t.radius: mark, chip, control, card, sheet, capsule):\n  ${failures.join('\n  ')}`,
  );
  process.exit(1);
}
