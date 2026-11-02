#!/usr/bin/env node
// Captures every mapped atlas screen on Expo web with the agent-browser CLI (no simulator).
//   node scripts/atlas-web.mjs [--port 8123] [--theme indigo|papel|noche] [--no-server] [id ...]
// Starts `expo start --web` (demo data) unless --no-server (reuse one on --port), then writes
// design/atlas/rn-web/<id>.png (402x874 @3x, iPhone 17 Pro; Papel ones as <id>.papel.png).
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { atlasDir, mappedScreens, mobileDir, parseArgs, sleep } from './atlas-lib.mjs';

const { options, ids } = parseArgs(process.argv.slice(2));
const port = Number(options.port ?? 8123);
const theme = options.theme ?? 'indigo';
const session = `atlas-${port}`;
const base = `http://localhost:${port}`;
const outDir = join(atlasDir, 'rn-web');
mkdirSync(outDir, { recursive: true });

const browser = (...args) =>
  execFileSync('agent-browser', ['--session', session, ...args], { encoding: 'utf8' });

async function reachable() {
  try {
    return (await fetch(base)).ok;
  } catch {
    return false;
  }
}

let server;
if (!options['no-server']) {
  server = spawn('npx', ['expo', 'start', '--web', '--port', String(port)], {
    cwd: mobileDir,
    env: { ...process.env, EXPO_PUBLIC_DEMO: '1', CI: '1' },
    stdio: 'ignore',
  });
}
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
  const targets = ids.length ? ids : mappedScreens().map((screen) => screen.id);
  browser('set', 'viewport', '402', '874', '3');
  // The first load bundles; later ones are instant.
  const suffix = theme === 'indigo' ? '' : `.${theme}`;
  for (const id of targets) {
    browser('open', `${base}/__atlas/${id}?theme=${theme}`);
    await sleep(id === targets[0] ? 8000 : 1800);
    // Expo's dev error toast (web-only DOM prop warnings) must not cover the capture.
    browser(
      'eval',
      "(function(){var s=document.createElement('style');s.textContent='#error-toast{display:none!important}';document.head.appendChild(s);})()",
    );
    browser('screenshot', join(outDir, `${id}${suffix}.png`));
    console.log(`ok ${id}${suffix}`);
  }
} catch (error) {
  console.error(String(error.message ?? error).split('\n')[0]);
  process.exitCode = 1;
} finally {
  stop();
}
