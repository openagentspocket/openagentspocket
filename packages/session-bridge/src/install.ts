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
}): string {
  const { configDir, node, script, path } = options;
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
