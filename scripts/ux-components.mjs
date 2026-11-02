#!/usr/bin/env node
// Captures catalog components on Expo web with the agent-browser CLI: /__gallery/components/<key>.
//   node scripts/ux-components.mjs [--port 8123] [--theme indigo|papel|both] [--no-server] [Name[.variant] ...]
// Keys default to every catalog variant of docs/ux/components/catalog.json. Writes
// design/atlas/components/rn-web/<key>[.papel].png (402x874 @3x) plus <key>[.papel].json with the
// component's rect, so `atlas-compare.py --components` can crop to it. Keys not registered in the
// gallery (the UX3 task has not landed) are skipped with a note.
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { atlasDir, mobileDir, parseArgs, sleep } from './atlas-lib.mjs';

const { options, ids } = parseArgs(process.argv.slice(2));
const port = Number(options.port ?? 8123);
const themes = options.theme === 'both' ? ['indigo', 'papel'] : [options.theme ?? 'indigo'];
const session = `ux-components-${port}`;
const base = `http://localhost:${port}`;
const outDir = join(atlasDir, 'components/rn-web');
mkdirSync(outDir, { recursive: true });

const catalog = JSON.parse(
  readFileSync(join(import.meta.dirname, '../docs/ux/components/catalog.json'), 'utf8'),
);
const allKeys = catalog.components.flatMap((c) =>
  c.variants
    .map((v) => v.split('|')[0])
    .map((id) => (id === 'default' ? c.name : `${c.name}.${id}`)),
);
const targets = ids.length
  ? ids.flatMap((id) => allKeys.filter((key) => key === id || key.startsWith(`${id}.`)))
  : allKeys;

const browser = (...args) =>
  execFileSync('agent-browser', ['--session', session, ...args], { encoding: 'utf8' });
const reachable = async () => {
  try {
    return (await fetch(base)).ok;
  } catch {
    return false;
  }
};

let server;
if (!options['no-server'])
  server = spawn('npx', ['expo', 'start', '--web', '--port', String(port)], {
    cwd: mobileDir,
    env: { ...process.env, EXPO_PUBLIC_DEMO: '1', CI: '1' },
    stdio: 'ignore',
  });
const stop = () => {
  try {
    browser('close');
  } catch {}
  server?.kill();
};
process.on('SIGINT', () => {
  stop();
  process.exit(130);
});

try {
  for (let i = 0; i < 120 && !(await reachable()); i++) await sleep(1000);
  if (!(await reachable())) throw new Error(`ERROR web server not reachable on ${base}`);
  browser('set', 'viewport', '402', '874', '3');
  let first = true;
  for (const theme of themes) {
    const suffix = theme === 'indigo' ? '' : `.${theme}`;
    for (const key of targets) {
      browser('open', `${base}/__gallery/components/${key}?theme=${theme}`);
      await sleep(first ? 8000 : 1500);
      first = false;
      browser(
        'eval',
        "(function(){var s=document.createElement('style');s.textContent='#error-toast{display:none!important}';document.head.appendChild(s);})()",
      );
      const rect = browser(
        'eval',
        `(function(){var e=document.querySelector('[data-testid="capture-${key}"]');if(!e)return 'null';var r=e.getBoundingClientRect();return JSON.stringify({x:r.x,y:r.y,width:r.width,height:r.height});})()`,
      ).trim();
      // agent-browser prints the eval result as a JSON string, so the rect arrives escaped: unwrap it.
      const unwrapped = rect.startsWith('"') ? JSON.parse(rect) : rect;
      const parsed = unwrapped.match(/\{.*\}/)?.[0];
      if (
        !parsed ||
        browser('eval', 'document.body.innerText.includes("No catalog component")').includes('true')
      ) {
        console.log(`skip ${key}${suffix} (not registered in the gallery yet)`);
        continue;
      }
      browser('screenshot', join(outDir, `${key}${suffix}.png`));
      writeFileSync(join(outDir, `${key}${suffix}.json`), parsed);
      console.log(`ok ${key}${suffix}`);
    }
  }
} catch (error) {
  console.error(String(error.message ?? error).split('\n')[0]);
  process.exitCode = 1;
} finally {
  stop();
}
