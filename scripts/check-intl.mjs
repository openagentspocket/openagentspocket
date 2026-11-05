// "Intl only through packages/core/src/intl.ts": Hermes ships a partial Intl, and `new Intl.RelativeTimeFormat`
// (or PluralRules, ListFormat, DisplayNames, Segmenter...) throws there, which closes a Release build.
// The helper falls back to plain English. The i18n package cannot import core and already guards its two
// uses (a try/catch around NumberFormat and DateTimeFormat), so those two files are the only exceptions.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ALLOWED = new Set([
  'packages/core/src/intl.ts',
  'packages/i18n/src/locale.ts',
  'packages/i18n/src/format.ts',
]);
const SKIP_DIRS = new Set(['node_modules', 'ios', 'android', 'dist', 'build', '.expo']);
const TOPS = [
  'apps/mobile/src',
  'packages/core/src',
  'packages/ui/src',
  'packages/i18n/src',
  'packages/transport/src',
];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.tsx?$/.test(name)) yield full;
  }
}

const failures = [];
for (const top of TOPS) {
  for (const file of walk(join(ROOT, top))) {
    const path = relative(ROOT, file);
    if (ALLOWED.has(path) || /\.test\.tsx?$/.test(path)) continue;
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, index) => {
        const code = line.trimStart();
        if (code.startsWith('//') || code.startsWith('*') || code.startsWith('/*')) return;
        if (/\bIntl\b/.test(line)) failures.push(`${path}:${index + 1}: ${line.trim()}`);
      });
  }
}

if (failures.length > 0) {
  console.error('Intl rule failed (use the helpers of packages/core/src/intl.ts):');
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
