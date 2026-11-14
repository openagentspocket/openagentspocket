// Deploys the update server (ADR 0028) with the owner's account values from deploy.local.json in
// this package (never committed: the repo is open source, so no account id or real hostname lives
// in wrangler.toml), the way packages/relay/scripts/deploy.mjs does:
//
//   { "domains": ["updates.example.com"], "accountId": "<optional, for a login with several accounts>" }
//
// Before `wrangler deploy` it checks wrangler.toml: the UPDATES R2 binding, Workers Logs off
// (`[observability] enabled = false`), no account_id and no committed route. The custom domain is
// passed as `--domain`; `accountId`, when set, as CLOUDFLARE_ACCOUNT_ID for wrangler only. A real
// deploy first checks that the bucket exists (`wrangler r2 bucket info`). There is no secret to put.
//
// Usage: node scripts/deploy.mjs [--dry-run]
//   --dry-run: the same checks, then `wrangler deploy --dry-run` (builds, uploads nothing), and no
//   bucket check: nothing on the account is read or changed.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { configuredBucketName, npxRunner } from '../publish/stores.js';

const PACKAGE_DIR = join(import.meta.dirname, '..');
const LOCAL_FILE = 'deploy.local.json';
const ALLOWED = ['domains', 'accountId'];
const HOSTNAME = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** What is wrong with wrangler.toml for a deploy of this Worker. */
export function tomlProblems(toml) {
  const problems = [];
  const live = toml
    .split('\n')
    .map((line) => line.replace(/#.*$/, '').trim())
    .filter(Boolean)
    .join('\n');
  if (!/\[\[r2_buckets\]\][^[]*?binding\s*=\s*"UPDATES"/s.test(live))
    problems.push('wrangler.toml binds no R2 bucket as UPDATES');
  if (!/\[observability\][^[]*?enabled\s*=\s*false/s.test(live))
    problems.push('wrangler.toml must keep Workers Logs off: [observability] enabled = false');
  if (/^account_id\s*=/m.test(live))
    problems.push('wrangler.toml must not carry an account_id (use deploy.local.json "accountId")');
  if (/^\[\[routes\]\]|^routes\s*=|^route\s*=/m.test(live))
    problems.push('wrangler.toml must not commit a route (use deploy.local.json "domains")');
  if (
    /^\[\[?(logpush|analytics_engine_datasets|tail_consumers)/m.test(live) ||
    /^logpush\s*=\s*true/m.test(live)
  )
    problems.push('wrangler.toml must not configure Logpush, Analytics Engine or tail Workers');
  return problems;
}

/** The deploy.local.json values, checked. */
export function localProblems(local) {
  const problems = [];
  const unknown = Object.keys(local).filter((key) => !ALLOWED.includes(key));
  if (unknown.length)
    problems.push(
      `not an update server value: ${unknown.join(', ')} (allowed: ${ALLOWED.join(', ')})`,
    );
  const domains = local.domains ?? [];
  if (!Array.isArray(domains) || !domains.length)
    problems.push(
      '"domains" needs the update domain, e.g. ["updates.example.com"] (the app config names it)',
    );
  for (const domain of Array.isArray(domains) ? domains : [])
    if (typeof domain !== 'string' || !HOSTNAME.test(domain))
      problems.push(`"${domain}" is not a hostname (no scheme, no path)`);
    else if (/(^|\.)example\.(com|org|net)$/.test(domain))
      problems.push(`"${domain}" is the placeholder; put your own update domain`);
  if (local.accountId !== undefined && !/^[0-9a-f]{32}$/.test(String(local.accountId)))
    problems.push('"accountId" is a 32-character hex Cloudflare account id');
  return problems;
}

/**
 * @param {{packageDir?: string, dryRun?: boolean, run?: ReturnType<typeof npxRunner>,
 *   env?: NodeJS.ProcessEnv, print?: (line: string) => void}} options
 * @returns {Promise<{ok: boolean, problems: string[], commands: string[][]}>}
 */
export async function deploy({
  packageDir = PACKAGE_DIR,
  dryRun = false,
  run,
  print = console.log,
} = {}) {
  const file = join(packageDir, LOCAL_FILE);
  if (!existsSync(file))
    return {
      ok: false,
      problems: [
        `missing ${LOCAL_FILE} (docs/guides/updates.md, "Owner steps"): { "domains": ["updates.<your domain>"] }`,
      ],
      commands: [],
    };
  let local;
  try {
    local = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return { ok: false, problems: [`${LOCAL_FILE} is not JSON`], commands: [] };
  }
  const problems = [
    ...tomlProblems(readFileSync(join(packageDir, 'wrangler.toml'), 'utf8')),
    ...localProblems(local),
  ];
  if (problems.length) return { ok: false, problems, commands: [] };

  const env = local.accountId ? { CLOUDFLARE_ACCOUNT_ID: local.accountId } : {};
  const exec = run ?? npxRunner(packageDir, env);
  const bucket = configuredBucketName(packageDir);
  const commands = [];
  const step = async (args) => {
    commands.push(args);
    print(`$ npx ${args.join(' ')}`);
    const result = await exec(args);
    if (result.stdout.trim()) print(result.stdout.trim());
    return result;
  };
  if (!dryRun) {
    const info = await step(['wrangler', 'r2', 'bucket', 'info', bucket]);
    if (info.status !== 0)
      return {
        ok: false,
        problems: [
          `the R2 bucket ${bucket} is not on the account (npx wrangler r2 bucket create ${bucket}): ${(info.stderr || '').trim()}`,
        ],
        commands,
      };
  }
  const domains = local.domains.flatMap((domain) => ['--domain', domain]);
  const result = await step(['wrangler', 'deploy', ...domains, ...(dryRun ? ['--dry-run'] : [])]);
  if (result.status !== 0)
    return {
      ok: false,
      problems: [`wrangler deploy failed: ${(result.stderr || '').trim()}`],
      commands,
    };
  if (!dryRun)
    print(
      `Deployed. Check: curl -si https://${local.domains[0]}/manifest -H 'expo-protocol-version: 1' ` +
        "-H 'expo-platform: ios' -H 'expo-runtime-version: 0' (expect 204), and in the dashboard that " +
        'Workers Logs stay disabled for openagentspocket-updates.',
    );
  return { ok: true, problems: [], commands };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { ok, problems } = await deploy({ dryRun: process.argv.includes('--dry-run') });
  for (const p of problems) console.error(`deploy: ${p}`);
  process.exit(ok ? 0 : 1);
}
