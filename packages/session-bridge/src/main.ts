#!/usr/bin/env node
// `herdr` as the app's Host endpoint expects it (packages/plugin/README.md, the launcher contract),
// answered over tmux. The app never knows it is not herdr.

import { spawn, spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pluginEntry } from './handler.js';
import { installLauncher } from './install.js';
import { tmuxRunner } from './runner.js';
import { startBridge } from './server.js';

const VERSION = '0.1.0';

export const configDir = () =>
  process.env.OAP_CONFIG_DIR || join(homedir(), '.config', 'openagentspocket');

const stateDir = () =>
  process.env.OAP_STATE_DIR || join(homedir(), '.local', 'state', 'openagentspocket');

/** In herdr's layout: the app's endpoint rules accept no other shape. */
export const bridgeSocket = () => join(configDir(), 'herdr', 'herdr.sock');

const print = (value: unknown) => console.log(JSON.stringify(value));

function attach(target: string | undefined): number {
  if (!target) return 2;
  for (const args of [
    ['select-window', '-t', target],
    ['select-pane', '-t', target],
  ]) {
    spawnSync('tmux', args, { stdio: 'ignore' });
  }
  return spawnSync('tmux', ['attach-session', '-t', target], { stdio: 'inherit' }).status ?? 1;
}

/** Pairing is the plugin's own ceremony, run as it runs for a relocated herdr. */
function pair(): number {
  const popup = fileURLToPath(new URL('../../plugin/src/pair-popup.js', import.meta.url));
  const env = {
    ...process.env,
    HERDR_PLUGIN_CONFIG_DIR: configDir(),
    HERDR_PLUGIN_STATE_DIR: stateDir(),
    HERDR_SOCKET_PATH: bridgeSocket(),
    HERDR_PLUGIN_ID: 'agentico',
  };
  return spawnSync(process.execPath, [popup], { env, stdio: 'inherit' }).status ?? 1;
}

function startInBackground(): void {
  const script = fileURLToPath(import.meta.url);
  spawn(process.execPath, [script, 'serve'], { detached: true, stdio: 'ignore' }).unref();
}

export async function main(args: readonly string[]): Promise<number> {
  const [command, subcommand, target] = args;
  const words = `${command} ${subcommand ?? ''}`.trim();
  switch (words) {
    case 'serve':
      await startBridge({ socketPath: bridgeSocket(), tmux: tmuxRunner(), version: VERSION });
      return -1;
    case 'install': {
      const launcher = installLauncher({
        configDir: configDir(),
        node: process.execPath,
        script: fileURLToPath(import.meta.url),
        path: process.env.PATH ?? '',
      });
      startInBackground();
      print({ socketPath: bridgeSocket(), executablePath: launcher });
      return 0;
    }
    case 'pair':
      return pair();
    case 'remote-client-bridge':
      startInBackground();
      return 0;
    case 'agent attach':
    case 'terminal attach':
      return attach(target);
    case 'session list':
      print({ sessions: [{ name: 'default', default: true, running: true }] });
      return 0;
    case 'plugin list':
      print({ plugins: [pluginEntry(VERSION)] });
      return 0;
    case 'plugin config-dir':
      console.log(configDir());
      return 0;
    default:
      console.error(`The tmux bridge has no "${words}"`);
      return 2;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main(process.argv.slice(2)).then((code) => {
    if (code >= 0) process.exitCode = code;
  });
}
