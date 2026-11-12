// Fast gate (<~15 s): biome, tsc -b, generated files, ratchets, then only the tests related to
// the changed files. Run before every report and commit; the pre-commit hook calls it.
//   pnpm verify-fast                 changes since HEAD (staged, unstaged, untracked)
//   pnpm verify-fast --base main     changes since the merge base with main: a branch or merge check
// The report names every test suite that ran and every one that did not, with the reason.
// A green run without --base stamps the tree it checked; the pre-commit hook skips its own run
// when the commit records exactly that tree (scripts/verify/stamp.mjs).
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { CODE, changedFiles, isData, readersOf } from './verify/changes.mjs';
import { pluginTests } from './verify/plugin-tests.mjs';
import { clearStamp, workingTree, writeStamp } from './verify/stamp.mjs';

const baseAt = process.argv.indexOf('--base');
const base = baseAt === -1 ? undefined : process.argv[baseAt + 1];
if (baseAt !== -1 && !base) {
  console.error('verify-fast: --base needs a ref, e.g. --base main');
  process.exit(2);
}

clearStamp();
// Before tsc: route types come from the route files on disk, not from the last Metro run.
execFileSync('node', ['scripts/typed-routes.mjs']);
const checkedTree = base ? null : workingTree();
const { since, files: changed } = changedFiles(base);

const inPkg = (prefix) => changed.filter((f) => f.startsWith(prefix));
const codeIn = (prefix) => inPkg(prefix).filter((f) => CODE.test(f));
const exists = (f) => existsSync(f);

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

const checks = [
  run('biome', 'pnpm', ['exec', 'biome', 'check', '.']),
  run('tsc -b', 'pnpm', ['exec', 'tsc', '-b']),
  run('generated types', 'pnpm', ['run', 'gen:check']),
  run('file length', 'node', ['scripts/check-file-length.mjs']),
  run('theme literals', 'node', ['scripts/check-theme-literals.mjs']),
  run('raw pressable', 'node', ['scripts/check-raw-pressable.mjs']),
  run('reuse', 'node', ['scripts/check-reuse.mjs']),
  run('spacing literals', 'node', ['scripts/check-spacing-literals.mjs']),
  run('intl rule', 'node', ['scripts/check-intl.mjs']),
  run('progress current', 'node', ['scripts/progress.mjs', '--check']),
  run('ux catalog', 'node', ['scripts/ux-catalog.mjs', '--check']),
];

// Every test suite lands in one of these, so the report says what ran and what did not.
const ran = [];
const skipped = [];
const suite = (label, why, promise) => {
  ran.push(`${label}: ${why}`);
  checks.push(promise);
};
const skip = (label, why) => skipped.push(`${label}: ${why}`);
const nothingUnder = (dir) => `nothing changed under ${dir}`;

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

// Tests related to the change: vitest/jest map changed source (and imported JSON) to the suites
// that import it. A changed data file (a golden, a fixture, a test vector) is in no import graph,
// so the test code that reads files and names it by a path part goes in as well. A changed runner
// config or setup file reaches every test: the whole suite runs.
const RELATED = [
  { dir: 'packages/core', jest: false, setups: [] },
  { dir: 'packages/transport', jest: false, setups: [] },
  { dir: 'packages/ui', jest: true, setups: [] },
  { dir: 'apps/mobile', jest: true, setups: ['packages/ui/jest.setup.js'] },
];
const runnerConfig = (dir, setups) =>
  changed.filter(
    (f) =>
      setups.includes(f) ||
      (/^(vitest|jest)\.(config|setup)\./.test(f.slice(dir.length + 1)) && f.startsWith(`${dir}/`)),
  );
const data = changed.filter((f) => isData(f) && exists(f));
const readers = readersOf(
  data,
  RELATED.map(({ dir }) => dir),
);
for (const { dir, jest, setups } of RELATED) {
  const config = runnerConfig(dir, setups);
  if (config.length) {
    const args = jest ? ['exec', 'jest', '--maxWorkers=2'] : ['exec', 'vitest', 'run'];
    suite(
      dir,
      `whole suite, its runner setup changed (${config.join(', ')})`,
      run(`${dir} tests`, 'pnpm', args, dir),
    );
    continue;
  }
  const source = codeIn(`${dir}/`).filter((f) => exists(f) && (!jest || /\.tsx?$/.test(f)));
  const json = inPkg(`${dir}/`).filter((f) => f.endsWith('.json') && exists(f));
  const read = readers.filter((f) => f.startsWith(`${dir}/`));
  const files = [...new Set([...source, ...json, ...read])].map((f) => f.slice(dir.length + 1));
  if (!files.length) {
    skip(dir, `no changed source, JSON or data file that its tests read`);
    continue;
  }
  const args = jest
    ? ['exec', 'jest', '--findRelatedTests', '--passWithNoTests', '--maxWorkers=2', ...files]
    : ['exec', 'vitest', 'related', '--run', '--passWithNoTests', ...files];
  const why = `related to ${source.length} changed code, ${json.length} changed JSON and ${read.length} file-reading test files`;
  suite(dir, why, run(`${dir} tests (related)`, 'pnpm', args, dir));
}

// The Expo config is JSON and plain JS that no test imports by path: its suite runs when it changes.
const appConfigFiles =
  /^apps\/mobile\/(app\.json|app\.config\.js|locales\/|plugins\/|package\.json)/;
const appConfigHit = changed.filter((f) => appConfigFiles.test(f));
if (appConfigHit.length)
  suite(
    'apps/mobile config',
    `${appConfigHit.length} changed config files`,
    run(
      'apps/mobile config test',
      'pnpm',
      ['exec', 'jest', '--maxWorkers=1', 'src/config/appConfig.test.ts'],
      'apps/mobile',
    ),
  );
else skip('apps/mobile config', 'no change to the Expo config');

// Whole suites: small ones, and the Node packages, on any change under them.
const WHOLE = [
  { dir: 'packages/i18n', cmd: ['exec', 'vitest', 'run'], codeOnly: false }, // ~1 s, catalogs too
  { dir: 'modules/ssh', cmd: ['exec', 'vitest', 'run'], codeOnly: true },
  { dir: 'modules/live-activity', cmd: ['exec', 'vitest', 'run'], codeOnly: true },
  { dir: 'packages/relay', cmd: ['test'], codeOnly: false },
  { dir: 'packages/session-bridge', cmd: ['test'], codeOnly: false },
  { dir: 'apps/site', cmd: ['test'], codeOnly: false },
];
for (const { dir, cmd, codeOnly } of WHOLE) {
  const hit = codeOnly ? codeIn(`${dir}/`) : inPkg(`${dir}/`);
  if (hit.length)
    suite(dir, `whole suite, ${hit.length} changed files`, run(`${dir} tests`, 'pnpm', cmd, dir));
  else skip(dir, codeOnly ? `no changed code under ${dir}` : nothingUnder(dir));
}

if (codeIn('packages/core/').length)
  skip(
    'packages/ui and apps/mobile tests that import core',
    'jest does not follow a change into packages/core; `pnpm test` covers them at a milestone',
  );

const results = await Promise.all(checks);
// Alone, after the rest: its Host-side scripts have bounds of a second or two, and tsc and jest
// running beside them made a real child process miss those bounds.
const plugin = pluginTests(changed);
if (plugin === null) {
  ran.push('packages/plugin: whole suite (a change no import scan can place)');
  results.push(await run('packages/plugin tests', 'pnpm', ['test'], 'packages/plugin'));
} else if (plugin.length) {
  ran.push(`packages/plugin: ${plugin.length} test files that reach the change`);
  const files = plugin.map((f) => f.replace('packages/plugin/', ''));
  const args = ['--test', '--test-concurrency=4', ...files];
  results.push(await run('packages/plugin tests (related)', 'node', args, 'packages/plugin'));
} else skip('packages/plugin', 'no plugin test reaches a changed file');

const scope = base ? `since ${base} (merge base ${since.slice(0, 9)})` : 'since HEAD';
console.log(`\n${changed.length} files changed ${scope}.`);
console.log(`tests run:${ran.length ? '' : ' none'}`);
for (const line of ran) console.log(`  ${line}`);
console.log('tests not run:');
for (const line of skipped) console.log(`  ${line}`);

if (results.includes(false)) {
  console.error('verify-fast: FAILED');
  process.exit(1);
}
if (checkedTree) {
  if (workingTree() === checkedTree) writeStamp(checkedTree);
  else console.log('files changed during the run: not stamped, the commit hook will check again');
}
if (!ran.length) {
  const hint = changed.length ? '' : '; for a branch or a commit, pnpm verify-fast --base main';
  console.log(`verify-fast: green, static checks only: no test ran${hint}`);
} else console.log('verify-fast: all green');
