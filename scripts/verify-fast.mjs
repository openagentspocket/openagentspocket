// Fast gate (<~15 s): biome, tsc -b, generated files, ratchets, then only the tests related to
// the changed files. Run before every report and commit; the pre-commit hook calls it.
import { execFileSync, spawn } from 'node:child_process';

const sh = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' });
const changed = sh('git', ['status', '--porcelain', '-uall'])
  .split('\n')
  .filter(Boolean)
  .map((line) => line.slice(3).replace(/^.* -> /, ''));

const inPkg = (prefix) => changed.filter((f) => f.startsWith(prefix));
const codeIn = (prefix) => inPkg(prefix).filter((f) => /\.(tsx?|jsx?|mjs)$/.test(f));

function run(label, cmd, args, cwd = '.') {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => {
      out += d;
    });
    child.stderr.on('data', (d) => {
      out += d;
    });
    child.on('close', (code) => {
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      console.log(`${code === 0 ? 'ok  ' : 'FAIL'} ${label} (${seconds}s)`);
      if (code !== 0)
        console.log(
          out
            .trim()
            .split('\n')
            .map((l) => `     ${l}`)
            .join('\n'),
        );
      resolve(code === 0);
    });
  });
}

// Before tsc: route types come from the route files on disk, not from the last Metro run.
sh('node', ['scripts/typed-routes.mjs']);

const checks = [
  run('biome', 'pnpm', ['exec', 'biome', 'check', '.']),
  run('tsc -b', 'pnpm', ['exec', 'tsc', '-b']),
  run('generated types', 'pnpm', ['run', 'gen:check']),
  run('file length', 'node', ['scripts/check-file-length.mjs']),
  run('theme literals', 'node', ['scripts/check-theme-literals.mjs']),
  run('progress current', 'node', ['scripts/progress.mjs', '--check']),
];

// Test files are excluded from `tsc -b` in core and i18n; their tsconfig.tests.json covers them.
// ui, ssh and mobile include their tests in `tsc -b` already.
for (const pkg of ['core', 'i18n', 'transport']) {
  if (inPkg(`packages/${pkg}/`).length)
    checks.push(
      run(
        `${pkg} test types`,
        'pnpm',
        ['exec', 'tsc', '-p', 'tsconfig.tests.json'],
        `packages/${pkg}`,
      ),
    );
}

// Tests related to the change; jest/vitest map source files to the suites that import them.
const coreFiles = codeIn('packages/core/');
if (coreFiles.length) {
  checks.push(
    run(
      'core tests (related)',
      'pnpm',
      [
        'exec',
        'vitest',
        'related',
        '--run',
        ...coreFiles.map((f) => f.replace('packages/core/', '')),
      ],
      'packages/core',
    ),
  );
}
const transportFiles = codeIn('packages/transport/');
if (transportFiles.length) {
  checks.push(
    run(
      'transport tests (related)',
      'pnpm',
      [
        'exec',
        'vitest',
        'related',
        '--run',
        ...transportFiles.map((f) => f.replace('packages/transport/', '')),
      ],
      'packages/transport',
    ),
  );
}
// i18n: the whole suite (~1 s), also when only a catalog JSON changed.
if (inPkg('packages/i18n/').length)
  checks.push(run('i18n tests', 'pnpm', ['exec', 'vitest', 'run'], 'packages/i18n'));
const sshFiles = codeIn('modules/ssh/');
if (sshFiles.length)
  checks.push(run('ssh tests', 'pnpm', ['exec', 'vitest', 'run'], 'modules/ssh'));
const liveActivityFiles = codeIn('modules/live-activity/');
if (liveActivityFiles.length)
  checks.push(
    run('live-activity tests', 'pnpm', ['exec', 'vitest', 'run'], 'modules/live-activity'),
  );
for (const dir of ['packages/ui', 'apps/mobile']) {
  const files = codeIn(`${dir}/`)
    .filter((f) => /\.tsx?$/.test(f))
    .map((f) => f.replace(`${dir}/`, ''));
  if (files.length) {
    checks.push(
      run(
        `${dir} tests (related)`,
        'pnpm',
        ['exec', 'jest', '--findRelatedTests', '--passWithNoTests', '--maxWorkers=2', ...files],
        dir,
      ),
    );
  }
}
for (const pkg of ['plugin', 'relay']) {
  if (inPkg(`packages/${pkg}/`).length)
    checks.push(run(`${pkg} tests`, 'pnpm', ['-F', `@openagentspocket/${pkg}`, 'test']));
}

const results = await Promise.all(checks);
if (results.includes(false)) {
  console.error('verify-fast: FAILED');
  process.exit(1);
}
console.log('verify-fast: all green');
