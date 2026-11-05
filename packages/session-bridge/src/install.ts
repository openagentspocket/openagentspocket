import { chmodSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

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
  return launcher;
}
