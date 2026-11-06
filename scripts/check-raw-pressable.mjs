#!/usr/bin/env node
// Ratchet: a control starts from `Button` (or a primitive built on it), never a bare Pressable.
//   node scripts/check-raw-pressable.mjs [--update]
// scripts/raw-pressable-baseline.json lists the files still using one; it may only shrink.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = join(ROOT, 'scripts/raw-pressable-baseline.json');
const TOPS = ['apps/mobile/src', 'packages/ui/src'];
const EXEMPT = /\.test\.|\/gallery\/|\/dev\/|primitives\/Button\.tsx$/;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (path.endsWith('.tsx')) yield path;
  }
}

const counts = {};
for (const top of TOPS) {
  for (const file of walk(join(ROOT, top))) {
    const path = relative(ROOT, file);
    if (EXEMPT.test(path)) continue;
    const n = readFileSync(file, 'utf8').split('<Pressable').length - 1;
    if (n > 0) counts[path] = n;
  }
}

if (process.argv.includes('--update')) {
  const sorted = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(BASELINE, `${JSON.stringify(sorted, null, 2)}\n`);
  console.log(`Raw Pressable baseline: ${Object.keys(sorted).length} files.`);
  process.exit(0);
}

const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {};
const failures = Object.entries(counts)
  .filter(([path, n]) => n > (baseline[path] ?? 0))
  .map(([path, n]) => `${path}: ${n} raw Pressable, baseline ${baseline[path] ?? 0} (use Button)`);
if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
