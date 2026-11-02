// Shared bits of the UX atlas scripts (atlas-web, atlas-ios, atlas-compare).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const root = join(import.meta.dirname, '..');
export const atlasDir = join(root, 'design/atlas');
export const mobileDir = join(root, 'apps/mobile');

/** The Swift reference repo (read-only). Override with SWIFT_REPO. */
export const swiftRepo =
  process.env.SWIFT_REPO ??
  [join(root, '../Agentico'), join(root, '../../../../Agentico')].find((dir) =>
    existsSync(join(dir, 'docs/ux/screens.yml')),
  ) ??
  join(root, '../Agentico');

/** Mapped screens: [{ id, rn, note }], the single list shared with the app's atlas entries. */
export function mappedScreens() {
  return JSON.parse(readFileSync(join(mobileDir, 'src/dev/atlas/atlasMap.json'), 'utf8'));
}

/** Flags that never take a value, so `--no-server some.id` keeps the id. */
const BOOLEAN_FLAGS = new Set(['no-server']);

/** `--key value` and `--flag` arguments; bare words are ids. */
export function parseArgs(argv) {
  const options = {};
  const ids = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      if (BOOLEAN_FLAGS.has(key) || next === undefined || next.startsWith('--'))
        options[key] = true;
      else {
        options[key] = next;
        i++;
      }
    } else ids.push(argv[i]);
  }
  return { options, ids };
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
