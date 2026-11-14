// scripts/deploy.mjs against a fake wrangler runner: what it checks before deploying, the commands
// it runs, and that a dry run reads nothing from the account. No network, no real deploy.

import assert from 'node:assert/strict';
import { copyFileSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

import { accountEnv } from '../publish/stores.js';
import { deploy, localProblems, tomlProblems } from '../scripts/deploy.mjs';
import { tempDir } from './support.js';

const PACKAGE = join(import.meta.dirname, '..');
const TOML = readFileSync(join(PACKAGE, 'wrangler.toml'), 'utf8');
const ACCOUNT = 'ab'.repeat(16);
let dir;

before(() => {
  dir = tempDir('updates-deploy-');
  copyFileSync(join(PACKAGE, 'wrangler.toml'), join(dir, 'wrangler.toml'));
});
after(() => rmSync(dir, { recursive: true, force: true }));

function fakeRunner({ bucketExists = true } = {}) {
  const calls = [];
  const run = async (args) => {
    calls.push(args);
    if (args[1] === 'r2')
      return bucketExists
        ? { status: 0, stdout: '', stderr: '' }
        : { status: 1, stdout: '', stderr: 'not found' };
    return { status: 0, stdout: 'ok', stderr: '' };
  };
  return { run, calls };
}

const writeLocal = (value) => writeFileSync(join(dir, 'deploy.local.json'), JSON.stringify(value));

test('the committed wrangler.toml passes: UPDATES bound, Workers Logs off, no account or route', () => {
  assert.deepEqual(tomlProblems(TOML), []);
});

test('wrangler.toml with logs on, an account id or a committed route is refused', () => {
  assert.match(
    tomlProblems(TOML.replace('enabled = false', 'enabled = true')).join(),
    /Workers Logs off/,
  );
  assert.match(tomlProblems(`account_id = "${ACCOUNT}"\n${TOML}`).join(), /account_id/);
  const routed = `${TOML}\n[[routes]]\npattern = "updates.my-project.dev"\ncustom_domain = true\n`;
  assert.match(tomlProblems(routed).join(), /route/);
  assert.match(
    tomlProblems(TOML.replace('binding = "UPDATES"', 'binding = "OTHER"')).join(),
    /UPDATES/,
  );
});

test('deploy.local.json needs a real hostname and nothing but the known values', () => {
  assert.deepEqual(localProblems({ domains: ['updates.my-project.dev'], accountId: ACCOUNT }), []);
  assert.match(localProblems({}).join(), /domains/);
  assert.match(localProblems({ domains: ['updates.example.com'] }).join(), /placeholder/);
  assert.match(
    localProblems({ domains: ['https://updates.my-project.dev/'] }).join(),
    /not a hostname/,
  );
  assert.match(localProblems({ domains: ['u.my-project.dev'], token: 'x' }).join(), /token/);
  assert.match(
    localProblems({ domains: ['u.my-project.dev'], accountId: 'nope' }).join(),
    /accountId/,
  );
});

test('a missing deploy.local.json stops before any command', async () => {
  rmSync(join(dir, 'deploy.local.json'), { force: true });
  const fake = fakeRunner();
  const result = await deploy({ packageDir: dir, run: fake.run, print: () => {} });
  assert.equal(result.ok, false);
  assert.match(result.problems.join(), /deploy\.local\.json/);
  assert.equal(fake.calls.length, 0);
});

test('a deploy checks the bucket, then deploys to the custom domain', async () => {
  writeLocal({ domains: ['updates.my-project.dev'] });
  const fake = fakeRunner();
  const result = await deploy({ packageDir: dir, run: fake.run, print: () => {} });
  assert.equal(result.ok, true);
  assert.deepEqual(fake.calls, [
    ['wrangler', 'r2', 'bucket', 'info', 'openagentspocket-updates'],
    ['wrangler', 'deploy', '--domain', 'updates.my-project.dev'],
  ]);
});

test('a missing bucket stops before the deploy', async () => {
  writeLocal({ domains: ['updates.my-project.dev'] });
  const fake = fakeRunner({ bucketExists: false });
  const result = await deploy({ packageDir: dir, run: fake.run, print: () => {} });
  assert.equal(result.ok, false);
  assert.match(result.problems.join(), /r2 bucket create/);
  assert.equal(fake.calls.length, 1);
});

test('a dry run reads nothing from the account and passes --dry-run to wrangler deploy', async () => {
  writeLocal({ domains: ['updates.my-project.dev'] });
  const fake = fakeRunner();
  const result = await deploy({ packageDir: dir, dryRun: true, run: fake.run, print: () => {} });
  assert.equal(result.ok, true);
  assert.deepEqual(fake.calls, [
    ['wrangler', 'deploy', '--domain', 'updates.my-project.dev', '--dry-run'],
  ]);
});

test('the account id in deploy.local.json reaches wrangler, unless the shell sets its own', () => {
  writeLocal({ domains: ['updates.my-project.dev'], accountId: ACCOUNT });
  assert.deepEqual(accountEnv(dir, {}), { CLOUDFLARE_ACCOUNT_ID: ACCOUNT });
  assert.deepEqual(accountEnv(dir, { CLOUDFLARE_ACCOUNT_ID: 'cd'.repeat(16) }), {});
  writeLocal({ domains: ['updates.my-project.dev'] });
  assert.deepEqual(accountEnv(dir, {}), {});
});
