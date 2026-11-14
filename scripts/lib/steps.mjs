// Printing and running the external commands of a release or an update publish. A step is
// { why, cmd, args, cwd, env? }; printed commands are relative to the repository root so they paste.
import { spawnSync } from 'node:child_process';
import { relative } from 'node:path';

const quote = (s) => (/^[\w./:=@+-]+$/.test(s) ? s : `'${s.replaceAll("'", "'\\''")}'`);

/** The step as a shell line run from `root`. */
export function shown(step, root) {
  const env = Object.entries(step.env ?? {}).map(([k, v]) => `${k}=${v} `);
  const line = `${env.join('')}${[step.cmd, ...step.args].map(quote).join(' ')}`;
  const dir = relative(root, step.cwd);
  return dir ? `(cd ${quote(dir)} && ${line})` : line;
}

/** Run a step with inherited output; returns the failure message, or null when it succeeded. */
export function runStep(step, root) {
  console.log(`\n== ${step.why}\n${shown(step, root)}`);
  const result = spawnSync(step.cmd, step.args, {
    cwd: step.cwd,
    stdio: 'inherit',
    env: { ...process.env, ...step.env },
  });
  return result.status === 0
    ? null
    : `step failed (${step.cmd} exited ${result.status ?? result.signal})`;
}
