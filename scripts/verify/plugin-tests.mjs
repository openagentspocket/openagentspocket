// Which packages/plugin test files a change reaches, by a plain scan instead of running all ~50 of
// them (~50 s). A test reaches a file through an import, or through a quoted path it spawns or
// reads ("../src/pair-accept.js", new URL("./usage-worker.js", import.meta.url)); the scan follows
// those from file to file. When the scan cannot be sure, it answers null: run everything.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const PLUGIN = 'packages/plugin';
const SCANNED = /\.(js|mjs|cjs|ts)$/;
// Quoted paths to files: imports, spawned scripts, read fixtures. Template literals with a static
// head (`./program-hooks/${name}`) stand for every file under that folder.
const QUOTED = /(['"`])((?:\.{1,2}\/)?[\w@.-]+(?:\/[\w@.-]+)*\.[a-z0-9]+)\1/g;
const TEMPLATE_DIR = /`((?:\.{1,2}\/)[\w@./-]*\/)\$\{/g;
// `join(plugin, "src", name)` or a copy of the whole tree: the test may run any source file.
const WHOLE_SRC = /['"]src['"]/;

const filesUnder = (dir) =>
  readdirSync(dir, { recursive: true })
    .map((name) => join(dir, name))
    .filter((file) => statSync(file).isFile());

function references(file) {
  const text = readFileSync(file, 'utf8');
  const here = dirname(file);
  const found = new Set();
  // A path is read from the file's folder or from the package root: join(plugin, "src/x.js").
  for (const [, , path] of text.matchAll(QUOTED))
    for (const base of [here, resolve(PLUGIN)]) {
      const target = resolve(base, path);
      if (existsSync(target) && statSync(target).isFile()) found.add(target);
    }
  for (const [, path] of text.matchAll(TEMPLATE_DIR)) {
    const target = resolve(here, path);
    if (existsSync(target) && statSync(target).isDirectory())
      for (const inner of filesUnder(target)) found.add(inner);
  }
  if (WHOLE_SRC.test(text) && file.includes(`${PLUGIN}/test/`))
    for (const inner of filesUnder(resolve(PLUGIN, 'src'))) found.add(inner);
  return found;
}

function closure(start) {
  const seen = new Set();
  const walk = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    if (SCANNED.test(file)) for (const next of references(file)) walk(next);
  };
  walk(start);
  return seen;
}

/** Every test file and the files it reaches, repo-relative. */
export function pluginTestReach() {
  const tests = readdirSync(resolve(PLUGIN, 'test')).filter((name) => name.endsWith('.test.js'));
  return new Map(
    tests.map((name) => {
      const test = `${PLUGIN}/test/${name}`;
      return [test, new Set([...closure(resolve(test))].map((file) => relative('.', file)))];
    }),
  );
}

/**
 * The plugin test files to run for `changed` (repo-relative), or null for all of them. A changed
 * test runs itself; a changed source runs the tests that reach it. Anything else in the package (a
 * testkit, a fixture, package.json, the manifest) or a source no test reaches runs everything. A
 * file outside the package that a plugin test reads (a core module, a script) selects that test.
 */
export function pluginTests(changed) {
  const reach = pluginTestReach();
  const selected = new Set();
  for (const file of changed) {
    const inside = file.startsWith(`${PLUGIN}/`);
    if (inside && file.startsWith(`${PLUGIN}/test/`) && file.endsWith('.test.js')) {
      if (existsSync(file)) selected.add(file);
      continue;
    }
    if (inside && !file.startsWith(`${PLUGIN}/src/`)) return null;
    const hits = [...reach].filter(([, files]) => files.has(file)).map(([test]) => test);
    if (inside && !hits.length) return null;
    for (const test of hits) selected.add(test);
  }
  return [...selected].sort();
}
