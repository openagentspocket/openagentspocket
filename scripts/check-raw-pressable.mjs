#!/usr/bin/env node
// A control starts from `Tappable` (usually through `Button`): only that primitive imports Pressable.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOPS = ['apps/mobile/src', 'packages/ui/src'];
const ALLOWED = 'packages/ui/src/primitives/Tappable.tsx';
const RAW =
  /<Pressable\b|\bPressable\b[^'\n]*from 'react-native'|<TouchableOpacity\b|<TouchableHighlight\b/;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (/\.tsx?$/.test(path)) yield path;
  }
}

const failures = [];
for (const top of TOPS) {
  for (const file of walk(join(ROOT, top))) {
    const path = relative(ROOT, file);
    if (path !== ALLOWED && RAW.test(readFileSync(file, 'utf8'))) failures.push(path);
  }
}
if (failures.length > 0) {
  console.error(`Use Button or Tappable, not a raw Pressable:\n${failures.join('\n')}`);
  process.exit(1);
}
