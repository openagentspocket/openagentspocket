// File-length ratchet: a source file over LIMIT lines may only shrink; a new file may not pass it.
// Screens (apps/mobile/src/app/** and *Screen.tsx) are held to SCREEN_LIMIT, no baseline.
//   node scripts/check-file-length.mjs            fail on any growth past the limit
//   node scripts/check-file-length.mjs --update   rewrite the baseline after a split
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = join(ROOT, 'scripts/file-length-baseline.json');
const LIMIT = 400;
const SCREEN_LIMIT = 150;
const EXTENSIONS = /\.(tsx?|jsx?|mjs|cjs)$/;
const SKIP_DIRS = new Set(['node_modules', 'ios', 'android', 'dist', 'build', '.expo', '.git']);
const isExempt = (path) => path.includes('.generated.');
const isScreen = (path) => path.startsWith('apps/mobile/src/app/') || path.endsWith('Screen.tsx');

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (EXTENSIONS.test(name)) yield full;
  }
}

const counts = {};
for (const top of ['apps', 'packages', 'modules', 'scripts']) {
  if (!existsSync(join(ROOT, top))) continue;
  for (const file of walk(join(ROOT, top))) {
    const path = relative(ROOT, file);
    if (!isExempt(path)) counts[path] = readFileSync(file, 'utf8').split('\n').length - 1;
  }
}

if (process.argv.includes('--update')) {
  const over = Object.fromEntries(
    Object.entries(counts)
      .filter(([path, n]) => n > LIMIT && !isScreen(path))
      .sort(([a], [b]) => a.localeCompare(b)),
  );
  writeFileSync(BASELINE, `${JSON.stringify(over, null, 2)}\n`);
  console.log(`File length baseline: ${Object.keys(over).length} files over ${LIMIT} lines.`);
  process.exit(0);
}

const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {};
const failures = [];
for (const [path, n] of Object.entries(counts)) {
  if (isScreen(path)) {
    if (n > SCREEN_LIMIT)
      failures.push(`${path}: ${n} lines, screen limit ${SCREEN_LIMIT} (extract components)`);
    continue;
  }
  const allowed = Math.max(LIMIT, baseline[path] ?? 0);
  if (n > allowed) {
    failures.push(
      path in baseline
        ? `${path}: ${n} lines, baseline ${baseline[path]} (may only shrink)`
        : `${path}: ${n} lines, limit ${LIMIT} (split it)`,
    );
  }
}
if (failures.length) {
  console.error(`File length ratchet failed:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log('file-length: ok');
