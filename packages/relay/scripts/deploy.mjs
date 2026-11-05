// Deploys the relay with the owner's non-secret account values from deploy.local.json (never committed:
// the repo is open source), passed as wrangler --var. Secrets (APNS_KEY_P8, FCM_SERVICE_ACCOUNT_JSON)
// stay in `wrangler secret put`. Usage: node scripts/deploy.mjs [--dry-run]
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const localFile = join(root, 'deploy.local.json');
if (!existsSync(localFile)) {
  console.error('Missing deploy.local.json (see README "Deploying"): { "APNS_TEAM_ID": "...", ... }');
  process.exit(1);
}
const vars = JSON.parse(readFileSync(localFile, 'utf8'));
const allowed = ['APNS_TEAM_ID', 'APNS_KEY_ID', 'APNS_TOPIC', 'FCM_PROJECT_ID', 'PRIVACY_CONTACT'];
const unknown = Object.keys(vars).filter((key) => !allowed.includes(key));
if (unknown.length) {
  console.error(`Not a relay var (secrets go through wrangler secret put): ${unknown.join(', ')}`);
  process.exit(1);
}
const flags = Object.entries(vars)
  .filter(([, value]) => value !== '')
  .flatMap(([key, value]) => ['--var', `${key}:${value}`]);
const args = ['wrangler', 'deploy', ...flags, ...(process.argv.includes('--dry-run') ? ['--dry-run'] : [])];
execFileSync('npx', args, { cwd: root, stdio: 'inherit' });
