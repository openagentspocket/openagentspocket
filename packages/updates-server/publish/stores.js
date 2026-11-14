// Where an upload goes. A store is { name, ready(), get(key), put(key, source, contentType), remove(key) }:
// - get resolves to the object's bytes, or null when the key does not exist; anything else throws;
// - put writes `source` ({path} or {bytes}) with that content type;
// - remove deletes a key; the upload uses it only to take back a channel pointer it just wrote.
// Three exist:
// - memoryStore: the in-memory bucket, for tests;
// - wranglerLocalStore: the local R2 simulation `wrangler dev` reads (`--local`, no account);
// - r2Store: the real bucket (`--remote`), with the owner's Cloudflare login or API token.
//
// Both wrangler stores run `npx wrangler r2 object get|put <bucket>/<key>` through an injected
// runner, so tests replace wrangler with a fake and nothing reaches the network.
import { execFile } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * @typedef {{name: string, concurrency?: number, ready(): void, get(key: string): Promise<Uint8Array | null>,
 *   put(key: string, source: {path?: string, bytes?: Uint8Array}, contentType: string): Promise<void> | void,
 *   remove(key: string): Promise<void>}} Store
 */

export const PACKAGE_DIR = join(import.meta.dirname, '..');

// What wrangler prints for a missing key, local or remote (wrangler 4, `r2 object get`).
const NOT_FOUND = /The specified key does not exist/;

const sourceBytes = (source) => source.bytes ?? new Uint8Array(readFileSync(source.path));

export function memoryStore(bucket) {
  return {
    name: 'memory',
    ready() {},
    async get(key) {
      const object = await bucket.get(key);
      return object ? new Uint8Array(await object.arrayBuffer()) : null;
    },
    async put(key, source, contentType) {
      await bucket.put(key, sourceBytes(source), { httpMetadata: { contentType } });
    },
    async remove(key) {
      bucket.objects.delete(key);
    },
  };
}

/** The bucket name wrangler.toml binds as UPDATES. */
export function configuredBucketName(packageDir = PACKAGE_DIR) {
  const toml = readFileSync(join(packageDir, 'wrangler.toml'), 'utf8');
  const name = /\[\[r2_buckets\]\][^[]*?bucket_name\s*=\s*"([^"]+)"/s.exec(toml)?.[1];
  if (!name) throw new Error('wrangler.toml binds no R2 bucket');
  return name;
}

/**
 * Runs `npx <args>` in `cwd` with the caller's environment (where CLOUDFLARE_API_TOKEN and
 * CLOUDFLARE_ACCOUNT_ID live, if the owner uses them) plus `env`. Output is captured, never echoed:
 * a failure message carries only wrangler's own error text.
 *
 * @returns {(args: string[]) => Promise<{status: number, stdout: string, stderr: string}>}
 */
export function npxRunner(cwd, env = {}) {
  return (args) =>
    new Promise((resolve) => {
      execFile(
        'npx',
        args,
        { cwd, env: { ...process.env, ...env }, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
        (error, stdout, stderr) => {
          const status = error ? (typeof error.code === 'number' ? error.code : 1) : 0;
          resolve({
            status,
            stdout: stdout ?? '',
            stderr: stderr || (error && !stdout ? error.message : ''),
          });
        },
      );
    });
}

/**
 * CLOUDFLARE_ACCOUNT_ID from the gitignored deploy.local.json ("accountId"), for a wrangler login
 * that sees several accounts; the shell's own CLOUDFLARE_ACCOUNT_ID wins. Empty when neither.
 */
export function accountEnv(packageDir = PACKAGE_DIR, env = process.env) {
  const file = join(packageDir, 'deploy.local.json');
  if (env.CLOUDFLARE_ACCOUNT_ID || !existsSync(file)) return {};
  const { accountId } = JSON.parse(readFileSync(file, 'utf8'));
  return accountId ? { CLOUDFLARE_ACCOUNT_ID: String(accountId) } : {};
}

const fileName = (key) => key.replaceAll('/', '_');

/**
 * @param {{mode: 'local' | 'remote', scratchDir: string, packageDir?: string, persistTo?: string,
 *   run?: ReturnType<typeof npxRunner>, env?: Record<string, string>}} options
 */
function wranglerStore({ mode, scratchDir, packageDir = PACKAGE_DIR, persistTo, run, env = {} }) {
  const bucket = configuredBucketName(packageDir);
  const exec = run ?? npxRunner(packageDir, env);
  const where = [
    `--${mode}`,
    ...(mode === 'local' && persistTo ? ['--persist-to', persistTo] : []),
  ];
  const output = (result) => (result.stderr || result.stdout).trim();
  let n = 0;
  return {
    name: mode === 'local' ? 'local' : 'r2',
    // Remote calls are independent HTTP requests; the local bucket is one SQLite file (one writer).
    concurrency: mode === 'local' ? 1 : 4,
    bucket,
    ready() {},
    async get(key) {
      n += 1;
      const file = join(scratchDir, `get-${n}-${fileName(key)}`);
      const result = await exec([
        'wrangler',
        'r2',
        'object',
        'get',
        `${bucket}/${key}`,
        '--file',
        file,
        ...where,
      ]);
      try {
        if (result.status === 0) return new Uint8Array(readFileSync(file));
        if (NOT_FOUND.test(`${result.stderr}\n${result.stdout}`)) return null;
        throw new Error(`wrangler r2 object get ${key} failed: ${output(result)}`);
      } finally {
        rmSync(file, { force: true });
      }
    },
    async put(key, source, contentType) {
      let file = source.path;
      if (!file) {
        file = join(scratchDir, `put-${fileName(key)}`);
        writeFileSync(file, source.bytes);
      }
      const result = await exec([
        'wrangler',
        'r2',
        'object',
        'put',
        `${bucket}/${key}`,
        '--file',
        file,
        '--content-type',
        contentType,
        ...where,
      ]);
      if (result.status !== 0)
        throw new Error(`wrangler r2 object put ${key} failed: ${output(result)}`);
    },
    async remove(key) {
      const result = await exec([
        'wrangler',
        'r2',
        'object',
        'delete',
        `${bucket}/${key}`,
        ...where,
      ]);
      if (result.status !== 0)
        throw new Error(`wrangler r2 object delete ${key} failed: ${output(result)}`);
    },
  };
}

/** The local R2 simulation in packages/updates-server/.wrangler/state, the one `wrangler dev` serves. */
export const wranglerLocalStore = (options) => wranglerStore({ ...options, mode: 'local' });

/**
 * The real R2 bucket on the owner's account, through `wrangler r2 object ... --remote`. Wrangler
 * authenticates with CLOUDFLARE_API_TOKEN (and CLOUDFLARE_ACCOUNT_ID when the token sees more than
 * one account) or, without them, the session `wrangler login` left. The repository holds neither.
 */
export const r2Store = (options) => wranglerStore({ ...options, mode: 'remote' });
