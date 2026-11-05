#!/usr/bin/env node
// pnpm sim:verify [flow ...]: the visual and navigation proof on the iOS simulator.
//   node scripts/sim-verify.mjs [--udid <id>] [--build] [--no-build] [--keep] [--port 8081] [flow ...]
// Builds the Debug dev client when the native inputs changed (or `--build`), reuses it otherwise;
// starts Metro with demo data (no real Host), runs the Maestro smoke flows of e2e/sim (all, or the
// ones named: `02`, `agent-chat`, `02-agent-chat`), leaves screenshots in design/atlas/sim/ and fails
// with the message on a Maestro failure, a crash report, a dead app or a development error screen.
// It takes the native slot (a lock, see below) for the whole run and shuts the simulator down after
// unless `--keep`. Run by the integrator or a native worker; never through computer use.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { atlasDir, mobileDir, parseArgs, root, sleep } from './atlas-lib.mjs';

const BOOLEAN = ['build', 'no-build', 'keep'];
const { options, ids } = parseArgs(
  process.argv.slice(2).flatMap((arg) => (BOOLEAN.includes(arg.slice(2)) ? [arg] : [arg])),
);
for (const flag of BOOLEAN) if (typeof options[flag] === 'string') ids.unshift(options[flag]);

const udid = String(options.udid ?? process.env.SIM_UDID ?? '2798C301-E0BB-41EF-A61F-4999184DFD05');
const port = Number(options.port ?? 8081);
const bundle = 'com.openagentspocket.app';
const outDir = join(atlasDir, 'sim');
const flowsDir = join(root, 'e2e/sim');
const stampFile = join(outDir, '.native-stamp');
const lockDir = join(tmpdir(), 'openagentspocket-native-slot.lock');
const maestro = existsSync(join(homedir(), '.maestro/bin/maestro'))
  ? join(homedir(), '.maestro/bin/maestro')
  : 'maestro';

const log = (message) => console.log(`sim:verify ${message}`);
const fail = (message) => {
  console.error(`sim:verify FAILED: ${message}`);
  process.exitCode = 1;
};
const simctl = (...args) => spawnSync('xcrun', ['simctl', ...args], { encoding: 'utf8' });

/** The native slot: one native run at a time. A lock directory holding the owner's pid. */
function takeSlot() {
  try {
    mkdirSync(lockDir);
  } catch {
    const owner = existsSync(join(lockDir, 'pid'))
      ? readFileSync(join(lockDir, 'pid'), 'utf8')
      : '?';
    let alive = false;
    try {
      process.kill(Number(owner), 0);
      alive = true;
    } catch {}
    if (alive) throw new Error(`the native slot is held by pid ${owner} (${lockDir})`);
    rmSync(lockDir, { recursive: true, force: true });
    mkdirSync(lockDir);
  }
  writeFileSync(join(lockDir, 'pid'), String(process.pid));
}
const releaseSlot = () => rmSync(lockDir, { recursive: true, force: true });

/** A hash of everything that changes the native binary: reuse the build only while it is equal. */
function nativeFingerprint() {
  const hash = createHash('sha1');
  const visit = (path) => {
    if (!existsSync(path)) return;
    if (statSync(path).isDirectory()) {
      for (const name of readdirSync(path).sort()) {
        if (['node_modules', 'ios', 'android', 'build', 'dist', '.expo'].includes(name)) continue;
        visit(join(path, name));
      }
    } else {
      hash.update(path).update(readFileSync(path));
    }
  };
  for (const path of [
    'package.json',
    'pnpm-lock.yaml',
    'apps/mobile/package.json',
    'apps/mobile/app.json',
    'apps/mobile/app.config.js',
    'apps/mobile/plugins',
    'apps/mobile/targets',
    'modules',
  ]) {
    visit(join(root, path));
  }
  return hash.digest('hex');
}

function installed() {
  return simctl('get_app_container', udid, bundle).status === 0;
}

function build() {
  log('building the Debug dev client (the native inputs changed)');
  const result = spawnSync(
    'npx',
    ['expo', 'run:ios', '--device', udid, '--configuration', 'Debug', '--no-bundler'],
    { cwd: mobileDir, stdio: 'inherit', env: { ...process.env, EXPO_PUBLIC_DEMO: '1' } },
  );
  if (result.status !== 0) throw new Error('the native build failed (see the output above)');
  writeFileSync(stampFile, nativeFingerprint());
}

async function startMetro() {
  const logPath = join(outDir, 'metro.log');
  const out = (await import('node:fs')).openSync(logPath, 'w');
  const server = spawn('npx', ['expo', 'start', '--port', String(port)], {
    cwd: mobileDir,
    env: { ...process.env, EXPO_PUBLIC_DEMO: '1', CI: '1' },
    stdio: ['ignore', out, out],
  });
  for (let i = 0; i < 90; i++) {
    try {
      if ((await fetch(`http://localhost:${port}/status`)).ok) return { server, logPath };
    } catch {}
    await sleep(1000);
  }
  server.kill();
  throw new Error(`Metro did not start on ${port} (see ${logPath})`);
}

const crashDir = join(homedir(), 'Library/Logs/DiagnosticReports');
/** Crash reports of the app written after `since` (ms). */
function crashesSince(since) {
  if (!existsSync(crashDir)) return [];
  return readdirSync(crashDir)
    .filter((name) => /\.(ips|crash)$/.test(name))
    .map((name) => join(crashDir, name))
    .filter((path) => statSync(path).mtimeMs >= since)
    .filter((path) => readFileSync(path, 'utf8').includes(bundle));
}

const appRunning = () => simctl('spawn', udid, 'launchctl', 'list').stdout.includes(bundle);

function pickFlows() {
  const all = readdirSync(flowsDir)
    .filter((name) => /^\d.*\.yaml$/.test(name))
    .sort();
  if (ids.length === 0) return all;
  return ids.map((id) => {
    const match = all.find((name) => name === id || name.startsWith(`${id}-`) || name.includes(id));
    if (!match) throw new Error(`no flow matches "${id}" (have: ${all.join(', ')})`);
    return match;
  });
}

let metro;
let slotTaken = false;
let touchedSimulator = false;
try {
  const flows = pickFlows();
  mkdirSync(outDir, { recursive: true });
  takeSlot();
  slotTaken = true;
  touchedSimulator = true;
  simctl('boot', udid);
  if (simctl('bootstatus', udid, '-b').status !== 0)
    throw new Error(`simulator ${udid} did not boot`);
  const stale = !existsSync(stampFile) || readFileSync(stampFile, 'utf8') !== nativeFingerprint();
  if (options.build || !installed() || (stale && !options['no-build'])) build();
  else log('reusing the installed build');
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
  metro = await startMetro();
  const started = Date.now();
  const failures = [];
  for (const flow of flows) {
    simctl('terminate', udid, bundle);
    const flowStart = Date.now();
    log(`running ${flow}`);
    const run = spawnSync(maestro, ['--udid', udid, 'test', join('e2e/sim', flow)], {
      cwd: root,
      encoding: 'utf8',
      env: process.env,
    });
    const crashes = crashesSince(flowStart);
    const metroLog = readFileSync(metro.logPath, 'utf8');
    const redbox = /Unhandled JS Exception|Render Error|Invariant Violation/.exec(
      metroLog.slice(-20000),
    );
    if (run.status !== 0) {
      failures.push(
        `${flow}: Maestro failed\n${(run.stdout + run.stderr).split('\n').slice(-12).join('\n')}`,
      );
    } else if (crashes.length > 0) {
      failures.push(`${flow}: the app crashed (${crashes[0]})`);
    } else if (!appRunning()) {
      failures.push(`${flow}: the app is not running after the flow (crash or exit)`);
    } else if (redbox) {
      failures.push(
        `${flow}: a development error screen appeared (${redbox[0]}, see ${metro.logPath})`,
      );
    }
  }
  const shots = existsSync(outDir)
    ? readdirSync(outDir).filter(
        (name) => name.endsWith('.png') && statSync(join(outDir, name)).mtimeMs >= started,
      )
    : [];
  log(`screenshots in ${outDir}:\n  ${shots.map((name) => join(outDir, name)).join('\n  ')}`);
  if (failures.length > 0) fail(`\n${failures.join('\n\n')}`);
  else log(`all ${flows.length} flow(s) passed`);
} catch (error) {
  fail(String(error.message ?? error));
} finally {
  metro?.server.kill();
  if (touchedSimulator) {
    simctl('status_bar', udid, 'clear');
    if (!options.keep) simctl('shutdown', udid);
  }
  if (slotTaken) releaseSlot();
}
