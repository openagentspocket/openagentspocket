#!/usr/bin/env node
// Captures every mapped atlas screen on the iOS simulator (the integrator's source of truth).
//   node scripts/atlas-ios.mjs --udid <sim udid> [--port 8081] [--theme indigo|papel|noche]
//                              [--bundle com.openagentspocket.app] [--no-server] [id ...]
// Needs the dev build already installed on that simulator (the native slot rules in
// docs/agents/swarm.md apply: hold the slot while this runs, shut the simulator down after).
// Starts Metro with demo data, points the dev client at it, then per id runs
// `xcrun simctl openurl openagentspocket://__atlas/<id>` and `simctl io screenshot` into
// design/atlas/rn-ios/<id>.png (Papel as <id>.papel.png).
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { atlasDir, mappedScreens, mobileDir, parseArgs, sleep } from './atlas-lib.mjs';

const { options, ids } = parseArgs(process.argv.slice(2));
const udid = options.udid;
if (typeof udid !== 'string') {
  console.error('ERROR --udid <simulator udid> is required');
  process.exit(2);
}
const port = Number(options.port ?? 8081); // Debug builds read the bundle from 8081
const theme = options.theme ?? 'indigo';
const bundle = options.bundle ?? 'com.openagentspocket.app';
const outDir = join(atlasDir, 'rn-ios');
mkdirSync(outDir, { recursive: true });

const simctl = (...args) =>
  execFileSync('xcrun', ['simctl', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

let server;
try {
  simctl('boot', udid);
} catch {} // already booted
simctl('bootstatus', udid, '-b');
try {
  simctl('get_app_container', udid, bundle);
} catch {
  console.error(
    `ERROR ${bundle} is not installed on ${udid}; the integrator builds the dev client first`,
  );
  process.exit(2);
}

try {
  // A clean status bar (9:41, full battery) keeps captures comparable.
  simctl(
    'status_bar',
    udid,
    'override',
    '--time',
    '9:41',
    '--batteryState',
    'charged',
    '--batteryLevel',
    '100',
  );
  simctl('ui', udid, 'appearance', theme === 'papel' ? 'light' : 'dark');
  if (!options['no-server']) {
    server = spawn('npx', ['expo', 'start', '--port', String(port)], {
      cwd: mobileDir,
      env: { ...process.env, EXPO_PUBLIC_DEMO: '1', CI: '1' },
      stdio: 'ignore',
    });
    for (let i = 0; i < 60; i++) {
      try {
        if ((await fetch(`http://localhost:${port}/status`)).ok) break;
      } catch {}
      await sleep(1000);
    }
  }
  try {
    simctl('terminate', udid, bundle);
  } catch {} // not running
  // A Debug build asks Metro on the default port (8081) for its bundle; no dev-client launcher.
  simctl('launch', udid, bundle);
  await sleep(15000); // first bundle
  const targets = ids.length ? ids : mappedScreens().map((screen) => screen.id);
  const suffix = theme === 'indigo' ? '' : `.${theme}`;
  for (const id of targets) {
    simctl('openurl', udid, `openagentspocket://__atlas/${id}?theme=${theme}`);
    await sleep(3000);
    simctl('io', udid, 'screenshot', join(outDir, `${id}${suffix}.png`));
    console.log(`ok ${id}${suffix}`);
  }
} catch (error) {
  console.error(String(error.message ?? error).split('\n')[0]);
  process.exitCode = 1;
} finally {
  server?.kill();
  try {
    simctl('status_bar', udid, 'clear');
  } catch {}
}
