// Publishes an over-the-air JS update for the iOS app (ADR 0028, docs/guides/updates.md). Signing
// happens here, on the owner's machine, with a key file named on the command line; the update server
// (packages/updates-server) only stores and serves what this writes.
//
//   node scripts/publish-update.mjs --key <path> --base-url <url> [--cert <pem>] [--keyid main]
//       [--skip-tests] [--dry-run]
//     Refuses unless on a clean main level with origin/main; runs pnpm test; computes the runtime
//     version and refuses one that no released build has (docs/releases/builds.json); exports the
//     app (npx expo export --platform ios); builds and signs the manifest; verifies the signature
//     against the certificate before writing; writes build/updates/<id>/ and verifies it as the
//     client would. Uploads nothing (a dry run is the default and only build mode).
//   Add --local-test for the local end-to-end with a throwaway key (see the guide).
//   node scripts/publish-update.mjs rollback --key <path> [--cert] [--keyid] [--runtime <rt>]
//     The same, for a signed rollBackToEmbedded directive (the emergency tool; prefer republishing
//     the last good commit).
//   node scripts/publish-update.mjs --upload <bundle-dir> --channel beta|production --target local|r2
//       [--base-url <url>] [--skip-beta] [--dry-run]
//     Verifies the bundle again for that channel and uploads it: assets, body and signature, read
//     back, then the channel pointer last (publish/upload.js). `local` writes the local R2 bucket
//     `wrangler dev` serves; `r2` the real bucket through `wrangler r2 object --remote`, with the
//     owner's wrangler login or CLOUDFLARE_API_TOKEN. With --base-url the deployed Worker is checked
//     as the app would, and a failed check puts the pointer back. Production needs the update on
//     beta first (--skip-beta to override). --dry-run prints every object and the pointer change and
//     touches nothing remote. A real r2 upload appends the entry to docs/releases/updates.jsonl and
//     prints the git commands to publish it.
//   node scripts/publish-update.mjs verify <bundle-dir> [--channel <c>] [--cert] [--keyid]
//   node scripts/publish-update.mjs verify --url <manifest-url> --channel <c> [--runtime <rt>]
//       [--allow-unlogged]
//     Checks a bundle, or what a server serves, the way the app would.
//
// The key is read only into memory, never printed or copied, never taken from the environment or
// from a path inside the repository.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';

import {
  createRollbackBundle,
  createUpdateBundle,
} from '../packages/updates-server/publish/create.js';
import { LOG_FILE, readLog } from '../packages/updates-server/publish/log.js';
import { normalizeBaseUrl, readExport } from '../packages/updates-server/publish/manifest.js';
import { runUpload } from '../packages/updates-server/publish/publish-upload.js';
import { loadCertificate, loadPrivateKey } from '../packages/updates-server/publish/signing.js';
import {
  accountEnv,
  r2Store,
  wranglerLocalStore,
} from '../packages/updates-server/publish/stores.js';
import { verifyBundle, verifyRemote } from '../packages/updates-server/publish/verify.js';
import { isChannel } from '../packages/updates-server/src/protocol.js';
import { gitProblems, headCommit } from './lib/git-state.mjs';
import { BUILDS_FILE, buildsForRuntime, readBuilds } from './lib/released-builds.mjs';
import { computeRuntimeVersion, RUNTIME_ENV } from './lib/runtime-version.mjs';
import { runStep } from './lib/steps.mjs';

const ROOT = join(import.meta.dirname, '..');
const MOBILE = join(ROOT, 'apps/mobile');
const PLATFORM = 'ios';
const DEFAULT_CERT = join(MOBILE, 'certs/updates.pem');

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);

function fail(message) {
  console.error(`publish-update: ${message}`);
  process.exit(1);
}

const keyId = () => option('--keyid') ?? 'main';
// --local-test: for the local end-to-end with a throwaway key and a Release simulator build
// (docs/guides/updates.md, "Test locally"). It skips the git and test gates, takes the builds record
// from --builds, requires a loopback --base-url and marks the bundle so the real upload refuses it.
const localTest = flag('--local-test');
const builds = ({ released = false } = {}) =>
  readBuilds(
    localTest && !released && option('--builds')
      ? resolve(option('--builds'))
      : join(ROOT, BUILDS_FILE),
  );
const log = () => readLog(join(ROOT, LOG_FILE));

function certificate() {
  const path = resolve(option('--cert') ?? DEFAULT_CERT);
  const { certificate: cert, problems } = loadCertificate(path);
  if (problems.length) fail(`certificate ${relative(ROOT, path)}: ${problems.join('; ')}`);
  return cert;
}

function shipPreconditions() {
  if (localTest)
    return console.log('--local-test: git and test gates skipped; this bundle cannot go to r2');
  const problems = gitProblems({ root: ROOT });
  for (const p of problems) console.log(`FAIL: ${p}`);
  if (problems.length) fail('preconditions failed: publish only a pushed, clean main');
}

function step(why, cmd, cmdArgs, cwd = ROOT, env = {}) {
  const problem = runStep({ why, cmd, args: cmdArgs, cwd, env }, ROOT);
  if (problem) fail(problem);
}

function summary(entry, outDir, baseUrl = '<update server URL>') {
  console.log(`\n${entry.kind} ${entry.id}`);
  console.log(`  runtime    ${entry.runtimeVersion}`);
  console.log(`  createdAt  ${entry.createdAt}`);
  console.log(`  commit     ${entry.commit}`);
  console.log(`  sha256     ${entry.bodySha256}`);
  console.log(`  bundle     ${relative(ROOT, outDir)}`);
  console.log('\nNothing was uploaded. Next (docs/guides/updates.md, "Publish"):');
  const target = localTest ? 'local --local-test' : 'r2';
  const upload = `node scripts/publish-update.mjs --upload ${relative(ROOT, outDir)} --channel beta --target ${target} --base-url ${baseUrl}`;
  console.log(`  ${upload} --dry-run`);
  console.log(`  ${upload}`);
}

function sinceLastUpdate(runtimeVersion) {
  const last = log()
    .filter((e) => e.platform === PLATFORM && e.runtimeVersion === runtimeVersion)
    .at(-1);
  if (!last) return console.log('\nFirst update for this runtime version.');
  console.log(`\nChanges since the last update (${last.id}, ${last.commit.slice(0, 9)}):`);
  step('commits since the last update', 'git', ['log', '--oneline', `${last.commit}..HEAD`]);
}

function releasedRuntime(runtimeVersion) {
  const reachable = buildsForRuntime(builds(), PLATFORM, runtimeVersion);
  if (!reachable.length)
    fail(
      `runtime ${runtimeVersion} matches no released build in ${BUILDS_FILE}; a native change needs a store release`,
    );
  console.log(
    `Runtime ${runtimeVersion}: builds ${reachable.map((b) => `${b.version} (${b.build})`).join(', ')}`,
  );
  return reachable.at(-1);
}

// The public Expo config the update carries as extra.expoClient: the app reads Constants.expoConfig
// from it while it runs the update, so it is resolved as for the store build (same environment).
function expoClient(build) {
  console.log('\n== the public Expo config the update carries (Constants.expoConfig)');
  const out = execFileSync('npx', ['expo', 'config', '--type', 'public', '--json'], {
    cwd: MOBILE,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    env: { ...process.env, ...RUNTIME_ENV, BUILD_NUMBER: build.build },
  });
  return JSON.parse(out);
}

async function publish() {
  shipPreconditions();
  const runtimeVersion = computeRuntimeVersion({ mobileDir: MOBILE, platform: PLATFORM });
  const build = releasedRuntime(runtimeVersion);
  const baseUrl = normalizeBaseUrl(option('--base-url') ?? fail('--base-url <url> is required'));
  if (localTest && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(baseUrl))
    fail('--local-test needs a loopback --base-url, e.g. http://127.0.0.1:8787');
  const cert = certificate();
  const privateKey = loadPrivateKey(option('--key'), { repoRoot: ROOT });
  sinceLastUpdate(runtimeVersion);
  if (!flag('--skip-tests') && !localTest) step('unit and component tests', 'pnpm', ['test']);
  const work = mkdtempSync(join(tmpdir(), 'publish-update-'));
  try {
    const exportDir = join(work, 'export');
    step(
      'export the JS bundle and assets (Hermes bytecode)',
      'npx',
      ['expo', 'export', '--platform', PLATFORM, '--output-dir', exportDir, '--clear'],
      MOBILE,
      { ...RUNTIME_ENV, BUILD_NUMBER: build.build, CI: '1' },
    );
    const config = expoClient(build);
    const id = crypto.randomUUID();
    const outDir = join(ROOT, 'build/updates', id);
    const { entry } = await createUpdateBundle({
      outDir,
      exported: readExport(exportDir, PLATFORM),
      platform: PLATFORM,
      runtimeVersion,
      builds: builds(),
      log: log(),
      baseUrl,
      expoClient: config,
      commit: headCommit(ROOT),
      privateKey,
      certificate: cert,
      keyId: keyId(),
      id,
      localTest,
    });
    summary(entry, outDir, baseUrl);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

async function rollback() {
  shipPreconditions();
  const runtimeVersion =
    option('--runtime') ?? computeRuntimeVersion({ mobileDir: MOBILE, platform: PLATFORM });
  releasedRuntime(runtimeVersion);
  const cert = certificate();
  const privateKey = loadPrivateKey(option('--key'), { repoRoot: ROOT });
  const id = crypto.randomUUID();
  const outDir = join(ROOT, 'build/updates', id);
  const { entry } = await createRollbackBundle({
    outDir,
    platform: PLATFORM,
    runtimeVersion,
    builds: builds(),
    log: log(),
    commit: headCommit(ROOT),
    privateKey,
    certificate: cert,
    keyId: keyId(),
    id,
    localTest,
  });
  summary(entry, outDir);
}

function report(problems, ok) {
  for (const p of problems) console.log(`FAIL ${p}`);
  if (problems.length) fail(`${problems.length} problem(s); the client would not apply this`);
  console.log(ok);
}

async function upload() {
  const target = option('--target');
  const scratch = mkdtempSync(join(tmpdir(), 'publish-update-'));
  try {
    await runUpload({
      dir: resolve(option('--upload')),
      channel: option('--channel'),
      target,
      makeStore: () =>
        target === 'local'
          ? wranglerLocalStore({ scratchDir: scratch })
          : r2Store({ scratchDir: scratch, env: accountEnv() }),
      log: log(),
      logFile: join(ROOT, LOG_FILE),
      certificate: certificate(),
      keyId: keyId(),
      builds: builds({ released: target === 'r2' }),
      baseUrl: option('--base-url'),
      dryRun: flag('--dry-run'),
      skipBeta: flag('--skip-beta'),
    });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

async function verify() {
  const cert = certificate();
  if (option('--url')) {
    const channel = option('--channel');
    if (!isChannel(channel)) fail('--channel beta|production is required with --url');
    const runtimeVersion =
      option('--runtime') ?? computeRuntimeVersion({ mobileDir: MOBILE, platform: PLATFORM });
    const { problems, served } = await verifyRemote({
      manifestUrl: option('--url'),
      platform: PLATFORM,
      runtimeVersion,
      channel,
      certificate: cert,
      keyId: keyId(),
      builds: builds(),
      log: log(),
      requireLogged: !flag('--allow-unlogged'),
    });
    return report(
      problems,
      served
        ? `ok: ${served.kind} sha256 ${served.bodySha256}${served.logged ? ', in the public log' : ''}`
        : 'ok: nothing published (204)',
    );
  }
  const dir = args[1];
  if (!dir || dir.startsWith('--')) fail('verify needs a bundle folder or --url');
  const { problems, entry } = await verifyBundle(resolve(dir), {
    certificate: cert,
    keyId: keyId(),
    builds: builds(),
    log: log(),
    channel: option('--channel'),
  });
  report(problems, `ok: ${entry.kind} ${entry.id} would be applied`);
}

try {
  if (args[0] === 'verify') await verify();
  else if (args[0] === 'rollback') await rollback();
  else if (flag('--upload')) await upload();
  else await publish();
} catch (error) {
  fail(error.message);
}
