// A stand-in for `npx wrangler r2 object get|put|delete`, for tests of the wrangler stores: the
// runner the stores take (stores.js npxRunner's shape), over an in-memory map. It answers like
// wrangler 4 (exit 1 and "The specified key does not exist." for a missing key) and records every
// call, so a test can check order, flags and that nothing ran at all.
import { readFileSync, writeFileSync } from 'node:fs';

/**
 * @param {{bucket?: string, fail?: (op: string, key: string) => string | null,
 *   corrupt?: (key: string) => boolean}} [options]
 *   fail: an error text to answer with instead (an auth failure, a network error); corrupt: the
 *   object reads back with other bytes than were put (what a read-back must catch).
 */
export function fakeWrangler({ bucket = 'openagentspocket-updates', fail, corrupt } = {}) {
  /** @type {Map<string, {bytes: Uint8Array, contentType: string | undefined}>} */
  const objects = new Map();
  /** @type {{op: string, key: string, args: string[]}[]} */
  const calls = [];
  const flag = (args, name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const answer = (status, stderr = '') => ({ status, stdout: '', stderr });

  async function run(args) {
    const [tool, r2, object, op, path] = args;
    if (tool !== 'wrangler' || r2 !== 'r2' || object !== 'object')
      return answer(1, 'not r2 object');
    const slash = path.indexOf('/');
    const [name, key] = [path.slice(0, slash), path.slice(slash + 1)];
    calls.push({ op, key, args });
    if (name !== bucket) return answer(1, `✘ [ERROR] The specified bucket does not exist.`);
    const failure = fail?.(op, key);
    if (failure) return answer(1, failure);
    if (op === 'get') {
      const found = objects.get(key);
      if (!found) return answer(1, '✘ [ERROR] The specified key does not exist.');
      writeFileSync(flag(args, '--file'), found.bytes);
      return answer(0);
    }
    if (op === 'put') {
      let bytes = new Uint8Array(readFileSync(flag(args, '--file')));
      if (corrupt?.(key)) bytes = new Uint8Array([...bytes, 0x21]);
      objects.set(key, { bytes, contentType: flag(args, '--content-type') });
      return answer(0);
    }
    if (op === 'delete') {
      objects.delete(key);
      return answer(0);
    }
    return answer(1, `unknown op ${op}`);
  }

  return {
    run,
    objects,
    calls,
    writes: () => calls.filter((c) => c.op !== 'get').map((c) => `${c.op} ${c.key}`),
  };
}
