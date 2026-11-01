// "Colors only from tokens": no color literal in app or UI source outside the generated tokens.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HEX = /#[0-9a-fA-F]{3,8}\b/;
const FUNC = /\b(?:rgba?|hsla?)\(/;
const NAMED = /\b(?:[bB]ackgroundColor|[bB]orderColor|tintColor|color)\s*:\s*['"`]/;
const SKIP_DIRS = new Set(['node_modules', 'ios', 'android', 'dist', 'build', '.expo']);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.tsx?$/.test(name)) yield full;
  }
}

const failures = [];
for (const top of ['apps/mobile/src', 'packages/ui/src']) {
  for (const file of walk(join(ROOT, top))) {
    const path = relative(ROOT, file);
    if (path.includes('.generated.') || /\.test\.tsx?$/.test(path)) continue;
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, index) => {
        if (HEX.test(line) || FUNC.test(line) || NAMED.test(line)) {
          failures.push(`${path}:${index + 1}: ${line.trim()}`);
        }
      });
  }
}
if (failures.length) {
  console.error(
    `Theme-literal rule failed (use a token from useTheme()):\n  ${failures.join('\n  ')}`,
  );
  process.exit(1);
}
console.log('theme-literals: ok');
