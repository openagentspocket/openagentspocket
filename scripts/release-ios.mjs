// Builds an App Store / TestFlight archive of the iOS app and checks it, stopping before the upload
// (docs/guides/release.md). Version and build number come from apps/mobile/app.json, so the commit
// that is archived records what shipped.
//   node scripts/release-ios.mjs [--dry-run] [--skip-tests] [--allow-branch]
//       preconditions, pnpm test, prebuild, pods, archive, export, checks; --dry-run prints the commands
//   node scripts/release-ios.mjs check <AgentsPocket.ipa | AgentsPocket.app> [--archive <.xcarchive>]
//       only the pre-upload checks, against an exported IPA (or a built .app)
// Optional App Store Connect API key instead of an Xcode sign-in (for signing and the upload):
// ASC_API_KEY_PATH, ASC_API_KEY_ID, ASC_API_ISSUER_ID.
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const MOBILE = join(ROOT, 'apps/mobile');
const IOS = join(MOBILE, 'ios');
const APP_JSON = JSON.parse(readFileSync(join(MOBILE, 'app.json'), 'utf8')).expo;
const VERSION = APP_JSON.version;
const BUILD = String(APP_JSON.ios.buildNumber);
const BUNDLE_ID = APP_JSON.ios.bundleIdentifier;
const APP_GROUPS = APP_JSON.ios.entitlements['com.apple.security.application-groups'];
// Expo names the Xcode project after `name` without spaces or punctuation ("Agents Pocket" -> AgentsPocket).
const PROJECT = APP_JSON.name.replace(/[^A-Za-z0-9]/g, '');
const TARGETS = readdirSync(join(MOBILE, 'targets'), { withFileTypes: true }).filter((d) =>
  d.isDirectory(),
);
// Every purpose string has a Spanish translation, so the Spanish list names them all.
const PURPOSE_KEYS = Object.keys(
  JSON.parse(readFileSync(join(MOBILE, 'locales/es.json'), 'utf8')).ios,
);
const RELEASE_ENV = { APNS_ENVIRONMENT: 'production', BUILD_NUMBER: BUILD };

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);

function fail(message) {
  console.error(`release-ios: ${message}`);
  process.exit(1);
}

const out = (cmd, cmdArgs, cwd = ROOT) =>
  execFileSync(cmd, cmdArgs, { cwd, encoding: 'utf8' }).trim();
const plist = (file) => JSON.parse(out('plutil', ['-convert', 'json', '-o', '-', file]));

function apiKeyFlags() {
  const { ASC_API_KEY_PATH: path, ASC_API_KEY_ID: id, ASC_API_ISSUER_ID: issuer } = process.env;
  if (!path && !id && !issuer) return [];
  if (!path || !id || !issuer)
    fail('set all of ASC_API_KEY_PATH, ASC_API_KEY_ID and ASC_API_ISSUER_ID, or none');
  return [
    '-authenticationKeyPath',
    path,
    '-authenticationKeyID',
    id,
    '-authenticationKeyIssuerID',
    issuer,
  ];
}

// --- Preconditions --------------------------------------------------------------------------------

function preconditions({ allowBranch }) {
  const problems = [];
  const branch = out('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branch !== 'main' && !allowBranch)
    problems.push(`on branch ${branch}, not main (--allow-branch to override)`);
  if (out('git', ['status', '--porcelain']))
    problems.push('the working tree has uncommitted changes');
  const upstream = spawnSync('git', ['rev-parse', '--verify', '--quiet', 'origin/main'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  const head = out('git', ['rev-parse', 'HEAD']);
  if (branch === 'main' && upstream.stdout.trim() !== head) {
    problems.push('main is not level with origin/main (git fetch, then pull or push)');
  }
  // The app recommends updating any Host whose plugin is older than the one it bundles, and the
  // update installs from the `plugin` branch: that branch must carry the version first.
  const pluginVersion = (toml) => /^version\s*=\s*"([^"]+)"/m.exec(toml)?.[1];
  const wanted = pluginVersion(
    readFileSync(join(ROOT, 'packages/plugin/herdr-plugin.toml'), 'utf8'),
  );
  const shipped = spawnSync('git', ['show', 'origin/plugin:herdr-plugin.toml'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (!wanted || pluginVersion(shipped.stdout) !== wanted) {
    problems.push(
      `origin/plugin carries plugin ${pluginVersion(shipped.stdout) ?? 'nothing'}, the app bundles ${wanted}: publish the plugin first`,
    );
  }
  if (!/^\d+\.\d+\.\d+$/.test(VERSION)) problems.push(`expo.version "${VERSION}" is not X.Y.Z`);
  if (!/^[1-9]\d*$/.test(BUILD))
    problems.push(`expo.ios.buildNumber "${BUILD}" is not a positive integer`);
  if (process.env.BUILD_NUMBER && process.env.BUILD_NUMBER !== BUILD) {
    problems.push(
      `BUILD_NUMBER=${process.env.BUILD_NUMBER} in the shell differs from app.json (${BUILD}); unset it`,
    );
  }
  const localFile = join(MOBILE, 'app.local.json');
  const local = existsSync(localFile) ? JSON.parse(readFileSync(localFile, 'utf8')) : {};
  if (!process.env.APPLE_TEAM_ID && !local.appleTeamId) {
    problems.push('no Apple team: set appleTeamId in apps/mobile/app.local.json or APPLE_TEAM_ID');
  }
  if (local.apnsEnvironment && local.apnsEnvironment !== 'production') {
    console.log(
      `note: app.local.json says apnsEnvironment=${local.apnsEnvironment}; this script overrides it`,
    );
  }
  if (!existsSync(join(MOBILE, 'google-services.json'))) {
    console.log('note: no apps/mobile/google-services.json (Android only; iOS is unaffected)');
  }
  return problems;
}

// --- Commands -------------------------------------------------------------------------------------

function plan(dir) {
  // Paths relative to the repository root, where the xcodebuild steps run, so the printed commands paste.
  const rel = relative(ROOT, dir);
  const archive = join(rel, `${PROJECT}.xcarchive`);
  const workspace = join(relative(ROOT, IOS), `${PROJECT}.xcworkspace`);
  const keyFlags = apiKeyFlags();
  return {
    archive,
    ipa: join(rel, 'export', `${PROJECT}.ipa`),
    steps: [
      {
        why: 'unit and component tests (milestone gate)',
        cmd: 'pnpm',
        args: ['test'],
        cwd: ROOT,
        tests: true,
      },
      {
        why: 'regenerate ios/ with the production entitlement and this build number',
        cmd: 'npx',
        args: ['expo', 'prebuild', '--clean', '--platform', 'ios', '--no-install'],
        cwd: MOBILE,
        env: { ...RELEASE_ENV, CI: '1' },
      },
      { why: 'install the native pods', cmd: 'pod', args: ['install'], cwd: IOS, env: RELEASE_ENV },
      {
        why: 'archive a Release build (the same variables reach the build phases)',
        cmd: 'xcodebuild',
        args: [
          '-workspace',
          workspace,
          '-scheme',
          PROJECT,
          '-configuration',
          'Release',
          '-destination',
          'generic/platform=iOS',
          '-archivePath',
          archive,
          '-allowProvisioningUpdates',
          ...keyFlags,
          'archive',
        ],
        cwd: ROOT,
        env: RELEASE_ENV,
      },
      {
        why: 'sign for App Store Connect and write the IPA locally (no upload yet)',
        cmd: 'xcodebuild',
        args: [
          '-exportArchive',
          '-archivePath',
          archive,
          '-exportPath',
          join(rel, 'export'),
          '-exportOptionsPlist',
          join(rel, 'ExportOptions.plist'),
          '-allowProvisioningUpdates',
          ...keyFlags,
        ],
        cwd: ROOT,
      },
    ],
  };
}

function exportOptions(destination) {
  // Automatic signing: Xcode picks the distribution certificate and App Store profiles for the app and
  // each extension. The build number is ours (app.json), never Xcode's.
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>${destination}</string>
  <key>signingStyle</key><string>automatic</string>
  <key>uploadSymbols</key><true/>
  <key>manageAppVersionAndBuildNumber</key><false/>
</dict>
</plist>
`;
}

const quote = (s) => (/^[\w./:=@+-]+$/.test(s) ? s : `'${s.replaceAll("'", "'\\''")}'`);
function shown(step) {
  const env = Object.entries(step.env ?? {}).map(([k, v]) => `${k}=${v} `);
  const line = `${env.join('')}${[step.cmd, ...step.args].map(quote).join(' ')}`;
  const dir = relative(ROOT, step.cwd);
  return dir ? `(cd ${quote(dir)} && ${line})` : line;
}

function run(step) {
  console.log(`\n== ${step.why}\n${shown(step)}`);
  const result = spawnSync(step.cmd, step.args, {
    cwd: step.cwd,
    stdio: 'inherit',
    env: { ...process.env, ...step.env },
  });
  if (result.status !== 0)
    fail(`step failed (${step.cmd} exited ${result.status ?? result.signal})`);
}

// --- Checks ---------------------------------------------------------------------------------------

function entitlements(bundle) {
  // codesign prints "Executable=..." on stderr; keep it out of the report.
  const xml = execFileSync('codesign', ['-d', '--entitlements', '-', '--xml', bundle], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  if (!xml) return {};
  const tmp = mkdtempSync(join(tmpdir(), 'release-ios-'));
  try {
    writeFileSync(join(tmp, 'e.plist'), xml);
    return plist(join(tmp, 'e.plist'));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function checkBundle(appPath, { archive } = {}) {
  const errors = [];
  const ok = (line) => console.log(`ok   ${line}`);
  const expect = (cond, line) => (cond ? ok(line) : errors.push(line));
  const info = plist(join(appPath, 'Info.plist'));

  const sig = spawnSync('codesign', ['--verify', '--deep', '--strict', appPath], {
    encoding: 'utf8',
  });
  expect(
    sig.status === 0,
    `codesign --verify --deep --strict ${basename(appPath)} ${sig.stderr.trim()}`,
  );
  expect(
    info.CFBundleIdentifier === BUNDLE_ID,
    `app bundle id ${info.CFBundleIdentifier}, expected ${BUNDLE_ID}`,
  );
  expect(
    !('ITSAppUsesNonExemptEncryption' in info),
    'no ITSAppUsesNonExemptEncryption key (answered per build in App Store Connect)',
  );
  for (const key of PURPOSE_KEYS) expect(Boolean(info[key]?.trim()), `purpose string ${key}`);
  const es = join(appPath, 'es.lproj/InfoPlist.strings');
  const esStrings = existsSync(es) ? plist(es) : {};
  for (const key of PURPOSE_KEYS)
    expect(Boolean(esStrings[key]?.trim()), `purpose string ${key} (es)`);

  const config = JSON.parse(readFileSync(join(appPath, 'EXConstants.bundle/app.config'), 'utf8'));
  const runtimeAps = config.ios?.entitlements?.['aps-environment'];
  expect(
    runtimeAps === 'production',
    `embedded app.config aps-environment ${runtimeAps} (push token tag)`,
  );
  expect(
    String(config.ios?.buildNumber) === BUILD,
    `embedded app.config buildNumber ${config.ios?.buildNumber}`,
  );

  const plugins = join(appPath, 'PlugIns');
  const appexes = existsSync(plugins)
    ? readdirSync(plugins).filter((n) => n.endsWith('.appex'))
    : [];
  expect(
    appexes.length === TARGETS.length,
    `${appexes.length} extensions, expected ${TARGETS.length} (apps/mobile/targets)`,
  );

  for (const bundle of [appPath, ...appexes.map((n) => join(plugins, n))]) {
    const name = basename(bundle);
    const b = plist(join(bundle, 'Info.plist'));
    const id = b.CFBundleIdentifier;
    expect(id === BUNDLE_ID || id.startsWith(`${BUNDLE_ID}.`), `${name}: bundle id ${id}`);
    expect(
      b.CFBundleShortVersionString === VERSION,
      `${name}: version ${b.CFBundleShortVersionString}, expected ${VERSION}`,
    );
    expect(
      String(b.CFBundleVersion) === BUILD,
      `${name}: build ${b.CFBundleVersion}, expected ${BUILD}`,
    );
    const e = entitlements(bundle);
    const aps = e['aps-environment'];
    if (bundle === appPath || aps !== undefined)
      expect(aps === 'production', `${name}: aps-environment ${aps}`);
    expect(!e['get-task-allow'], `${name}: no get-task-allow (distribution signature)`);
    expect(
      String(e['application-identifier']).endsWith(`.${id}`),
      `${name}: signed for ${e['application-identifier'] ? 'this id' : 'nothing'}`,
    );
    const groups = e['com.apple.security.application-groups'] ?? [];
    expect(
      APP_GROUPS.every((g) => groups.includes(g)),
      `${name}: app group ${APP_GROUPS.join(', ')}`,
    );
  }

  if (archive) {
    const dsyms = join(archive, 'dSYMs');
    const have = existsSync(dsyms) ? readdirSync(dsyms) : [];
    for (const name of [basename(appPath), ...appexes])
      expect(have.includes(`${name}.dSYM`), `dSYM for ${name}`);
  }
  return errors;
}

function check(target, archive) {
  if (!target || !existsSync(target)) fail('check needs the path of an .ipa or .app');
  let appPath = target;
  let tmp;
  if (target.endsWith('.ipa')) {
    tmp = mkdtempSync(join(tmpdir(), 'release-ios-'));
    execFileSync('ditto', ['-x', '-k', target, tmp]);
    const payload = join(tmp, 'Payload');
    appPath = join(
      payload,
      readdirSync(payload).find((n) => n.endsWith('.app')),
    );
  }
  try {
    const errors = checkBundle(appPath, { archive });
    for (const e of errors) console.log(`FAIL ${e}`);
    if (errors.length) fail(`${errors.length} check(s) failed; do not upload`);
    console.log(`\n${VERSION} (${BUILD}) passed the pre-upload checks.`);
  } finally {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  }
}

// --- Main -----------------------------------------------------------------------------------------

function release({ dryRun, skipTests, allowBranch }) {
  const dir = join(ROOT, 'build/release', `ios-${VERSION}-${BUILD}`);
  console.log(
    `Release ${APP_JSON.name} ${VERSION} (${BUILD}), ${BUNDLE_ID}, into ${relative(ROOT, dir)}`,
  );
  const problems = preconditions({ allowBranch });
  for (const p of problems) console.log(`${dryRun ? 'would stop' : 'FAIL'}: ${p}`);
  if (problems.length && !dryRun) fail('preconditions failed');
  if (existsSync(dir) && !dryRun)
    fail(`${relative(ROOT, dir)} exists: bump the build number, or move it away`);

  const { archive, ipa, steps } = plan(dir);
  const todo = steps.filter((s) => !(s.tests && skipTests));
  if (dryRun) {
    console.log(
      `\n# ExportOptions.plist (export), in ${relative(ROOT, dir)}:\n${exportOptions('export')}`,
    );
    console.log('# ExportOptions-upload.plist: the same with destination upload\n');
    for (const s of todo) console.log(`# ${s.why}\n${shown(s)}\n`);
    console.log(`# then: node scripts/release-ios.mjs check ${ipa} --archive ${archive}`);
    return;
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'ExportOptions.plist'), exportOptions('export'));
  // For the upload with an Xcode sign-in (docs/guides/release.md, "Upload"): same signing, sent to Apple.
  writeFileSync(join(dir, 'ExportOptions-upload.plist'), exportOptions('upload'));
  for (const s of todo) run(s);
  check(join(ROOT, ipa), join(ROOT, archive));
  console.log(
    `\nNext (docs/guides/release.md, "Upload"): upload ${ipa}. Keep ${relative(ROOT, dir)}.`,
  );
}

if (args[0] === 'check') check(args[1], option('--archive'));
else
  release({
    dryRun: flag('--dry-run'),
    skipTests: flag('--skip-tests'),
    allowBranch: flag('--allow-branch'),
  });
