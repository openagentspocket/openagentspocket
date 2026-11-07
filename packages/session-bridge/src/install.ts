import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function readJson(path: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

const quoted = (word: string) => `'${word.replaceAll("'", `'\\''`)}'`;

/**
 * Writes the launcher the app's endpoint names. It carries this shell's PATH: sshd's own is minimal,
 * and neither `node` nor `tmux` would be found over SSH.
 */
export function installLauncher(options: {
  configDir: string;
  node: string;
  script: string;
  path: string;
  /** The named server the bridge runs on: an SSH exec of the launcher has no other way to know it. */
  tmuxSocket?: string;
}): string {
  const { configDir, node, script, path, tmuxSocket } = options;
  const bin = join(configDir, 'bin');
  const launcher = join(bin, 'herdr');
  mkdirSync(bin, { recursive: true, mode: 0o700 });
  const temp = `${launcher}.tmp-${process.pid}`;
  writeFileSync(
    temp,
    [
      '#!/bin/sh',
      `export PATH=${quoted(path)}`,
      `export OAP_CONFIG_DIR=${quoted(configDir)}`,
      ...(tmuxSocket ? [`export OAP_TMUX_SOCKET=${quoted(tmuxSocket)}`] : []),
      `exec ${quoted(node)} ${quoted(script)} "$@"`,
      '',
    ].join('\n'),
  );
  chmodSync(temp, 0o755);
  renameSync(temp, launcher);
  // The Pairing Code names this launcher, as a relocated herdr's would.
  const pairConfig = join(configDir, 'pair.json');
  const existing = readJson(pairConfig);
  writeFileSync(pairConfig, `${JSON.stringify({ ...existing, launcher })}\n`);
  return launcher;
}

/**
 * What the plugin's Host-side scripts read in place of herdr's startup hook: which node runs them,
 * where their state lives, and that this launcher answers `agent read` and `agent send-keys`.
 */
export function recordRuntime(options: {
  configDir: string;
  stateDir: string;
  node: string;
  launcher: string;
  home: string;
  path: string;
}): void {
  const { configDir, stateDir, node, launcher, home, path } = options;
  mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  const runtime = { version: 1, node, herdr: launcher, stateDir, env: { HOME: home, PATH: path } };
  writeFileSync(join(configDir, 'runtime.json'), `${JSON.stringify(runtime)}\n`, { mode: 0o600 });
  writeFileSync(join(configDir, 'runtime-node'), `${node}\n`);
}
