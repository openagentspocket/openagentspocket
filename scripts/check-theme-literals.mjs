// "Colors only from tokens": no color literal in app or UI source outside the generated tokens, and no
// raw platform control (Switch, RefreshControl, ActivityIndicator, TextInput) outside its one shared wrapper
// in packages/ui/src/primitives, so every control takes its tint from the theme (Toggle, ThemedRefreshControl,
// Spinner, ThemedTextInput).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HEX = /#[0-9a-fA-F]{3,8}\b/;
const FUNC = /\b(?:rgba?|hsla?)\(/;
const NAMED = /\b(?:[bB]ackgroundColor|[bB]orderColor|tintColor|color)\s*:\s*['"`]/;
const RAW_CONTROLS = new Set(['Switch', 'RefreshControl', 'ActivityIndicator', 'TextInput']);
const WRAPPERS = new Set([
  'packages/ui/src/primitives/Toggle.tsx',
  'packages/ui/src/primitives/ThemedRefreshControl.tsx',
  'packages/ui/src/primitives/Spinner.tsx',
  'packages/ui/src/primitives/ThemedTextInput.tsx',
]);
const RN_IMPORT = /import\s*\{([^}]*)\}\s*from\s*'react-native'/g;
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
const controls = [];
for (const top of ['apps/mobile/src', 'packages/ui/src']) {
  for (const file of walk(join(ROOT, top))) {
    const path = relative(ROOT, file);
    if (path.includes('.generated.') || /\.test\.tsx?$/.test(path)) continue;
    const source = readFileSync(file, 'utf8');
    if (!WRAPPERS.has(path)) {
      for (const match of source.matchAll(RN_IMPORT)) {
        for (const member of (match[1] ?? '').split(',').map((m) => m.trim())) {
          if (RAW_CONTROLS.has(member)) {
            controls.push(
              `${path}: raw ${member} from react-native (use the themed wrapper from @openagentspocket/ui)`,
            );
          }
        }
      }
    }
    source.split('\n').forEach((line, index) => {
      if (HEX.test(line) || FUNC.test(line) || NAMED.test(line)) {
        failures.push(`${path}:${index + 1}: ${line.trim()}`);
      }
    });
  }
}
if (controls.length) {
  console.error(`Raw platform control rule failed:\n  ${controls.join('\n  ')}`);
  process.exit(1);
}
if (failures.length) {
  console.error(
    `Theme-literal rule failed (use a token from useTheme()):\n  ${failures.join('\n  ')}`,
  );
  process.exit(1);
}
console.log('theme-literals: ok');
