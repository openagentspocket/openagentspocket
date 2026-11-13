#!/usr/bin/env node
// Captures every mapped atlas screen on Expo web with the agent-browser CLI (no simulator).
//   node scripts/atlas-web.mjs [--port 8123] [--theme indigo|papel|noche] [--no-server] [id ...]
// Starts `expo start --web` (demo data) unless --no-server (reuse one on --port), then writes
// design/atlas/rn-web/<id>.png (402x874 @3x, iPhone 17 Pro; Papel ones as <id>.papel.png; ids with
// "device": "ipad" in atlasMap.json at 1366x1024 @2 as <id>.ipad.png).
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
  // Screens marked "device": "ipad" in atlasMap.json need the wide window (iPad 13" landscape).
  const devices = new Map(mappedScreens().map((screen) => [screen.id, screen.device ?? 'iphone']));
  let viewport = '';
  const setViewport = (device) => {
    if (device === viewport) return;
    viewport = device;
    if (device === 'ipad') browser('set', 'viewport', '1366', '1024', '2');
    else browser('set', 'viewport', '402', '874', '3');
  };
  const ready = () => {
    try {
      return (
        Number(browser('eval', "document.querySelectorAll('[data-testid]').length").trim()) > 3
      );
    } catch {
      return false;
    }
  };
  // The first load bundles; later ones are instant.
  // A capture of the app's error screen or a development overlay is a failure, not an "ok".
  const ERROR_PROBE = `(function(){
    var f=document.querySelector('[data-testid="render-error"]');
    if(f)return 'error screen: '+f.innerText.replace(/\\s+/g,' ').slice(0,200);
    var o=document.querySelector('[data-testid="logbox"],[data-testid="logbox_container"],#expo-dev-overlay,#react-refresh-overlay,vite-error-overlay,nextjs-portal');
    return o?'development overlay: '+(o.id||o.tagName):'';
  })()`;
  const failures = [];
  const suffix = theme === 'indigo' ? '' : `.${theme}`;
  for (const id of targets) {
    setViewport(devices.get(id) ?? 'iphone');
    browser('open', `${base}/__atlas/${id}?theme=${theme}`);
    // Readiness check, not a fixed wait: the first load bundles and can paint a blank canvas.
    await sleep(1800);
    for (let i = 0; i < 60 && !ready(); i++) await sleep(1000);
    await sleep(600);
    // Expo's dev error toast (web-only DOM prop warnings) must not cover the capture.
    browser(
      'eval',
      "(function(){var s=document.createElement('style');s.textContent='#error-toast{display:none!important}';document.head.appendChild(s);})()",
    );
    const device = devices.get(id) === 'ipad' ? '.ipad' : '';
    browser('screenshot', join(outDir, `${id}${device}${suffix}.png`));
    let problem = '';
    try {
      problem = browser('eval', ERROR_PROBE).trim().replace(/^"|"$/g, '');
    } catch (error) {
      problem = `could not inspect the page: ${String(error.message ?? error).split('\n')[0]}`;
    }
    if (problem) {
      failures.push(id);
      console.log(`FAIL ${id}${device}${suffix}: ${problem}`);
    } else console.log(`ok ${id}${device}${suffix}`);
  }
  if (failures.length) {
    console.error(`ERROR ${failures.length} screen(s) did not render: ${failures.join(', ')}`);
    process.exitCode = 1;
  }
} catch (error) {
  console.error(String(error.message ?? error).split('\n')[0]);
  process.exitCode = 1;
} finally {
  stop();
}
