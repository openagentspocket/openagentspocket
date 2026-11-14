// Plain node modules, loaded through jest: the app's tsconfig carries no node types.
const fs = jest.requireActual('node:fs') as {
  readFileSync(file: string, encoding: 'utf8'): string;
  existsSync(file: string): boolean;
  mkdtempSync(prefix: string): string;
  writeFileSync(file: string, data: string): void;
  rmSync(file: string, options: { recursive: boolean; force: boolean }): void;
};
const os = jest.requireActual('node:os') as { tmpdir(): string };
const path = jest.requireActual('node:path') as { join(...parts: string[]): string };
const childProcess = jest.requireActual('node:child_process') as {
  execFileSync(
    file: string,
    args: string[],
    options: { cwd: string; encoding: 'utf8'; env: Record<string, string | undefined> },
  ): string;
};

interface ResolvedConfig {
  updates?: Record<string, unknown>;
  ios: {
    appleTeamId?: string;
    buildNumber?: string;
    entitlements?: Record<string, unknown>;
    infoPlist?: Record<string, unknown>;
  };
  android: { versionCode?: number };
}

const root = process.cwd();
const configure = jest.requireActual(path.join(root, 'app.config.js')) as (input: {
  config: Record<string, unknown>;
}) => ResolvedConfig;
const base = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo;

const BUILD_ENV = [
  'APPLE_TEAM_ID',
  'APNS_ENVIRONMENT',
  'BUILD_NUMBER',
  'UPDATES_URL',
  'UPDATES_CERTIFICATE',
] as const;
const saved = Object.fromEntries(BUILD_ENV.map((name) => [name, process.env[name]]));
function clearBuildEnv() {
  for (const name of BUILD_ENV) delete process.env[name];
}
afterEach(() => {
  for (const name of BUILD_ENV) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

describe('Expo config and the Apple team', () => {
  it('keeps the team out of every tracked file (the repo is open source)', () => {
    expect(base.ios.appleTeamId).toBeUndefined();
    for (const target of ['notification-service', 'widgets']) {
      const text = fs.readFileSync(
        path.join(root, 'targets', target, 'expo-target.config.js'),
        'utf8',
      );
      expect(text).not.toMatch(/appleTeamId|DEVELOPMENT_TEAM/);
    }
  });

  it('injects the owner team into ios.appleTeamId, the one place @bacons/apple-targets reads for the app and every target', () => {
    process.env.APPLE_TEAM_ID = 'TEAM123456';
    expect(configure({ config: base }).ios.appleTeamId).toBe('TEAM123456');
  });

  it('builds without a team when none is configured', () => {
    clearBuildEnv();
    const local = path.join(root, 'app.local.json');
    if (!fs.existsSync(local)) expect(configure({ config: base }).ios.appleTeamId).toBeUndefined();
  });
});

describe('Expo config and the APNs environment', () => {
  it('signs with the development entitlement by default, so local device installs keep sandbox tokens', () => {
    clearBuildEnv();
    const localFile = path.join(root, 'app.local.json');
    const local = fs.existsSync(localFile) ? JSON.parse(fs.readFileSync(localFile, 'utf8')) : {};
    const expected = local.apnsEnvironment ?? 'development';
    expect(configure({ config: base }).ios.entitlements?.['aps-environment']).toBe(expected);
  });

  it('signs a store build with the production entitlement when APNS_ENVIRONMENT says so', () => {
    clearBuildEnv();
    process.env.APNS_ENVIRONMENT = 'production';
    const entitlements = configure({ config: base }).ios.entitlements;
    expect(entitlements?.['aps-environment']).toBe('production');
    expect(entitlements?.['com.apple.security.application-groups']).toEqual(
      base.ios.entitlements['com.apple.security.application-groups'],
    );
  });

  it('rejects any other value instead of signing an unknown environment', () => {
    clearBuildEnv();
    process.env.APNS_ENVIRONMENT = 'prod';
    expect(() => configure({ config: base })).toThrow(/APNS_ENVIRONMENT/);
  });

  it('leaves the entitlement out of app.json, so app.config.js is its one source', () => {
    expect(base.ios.entitlements['aps-environment']).toBeUndefined();
  });
});

describe('Expo config and the build number', () => {
  it('uses the checked-in build number for both stores by default', () => {
    clearBuildEnv();
    const resolved = configure({ config: base });
    expect(resolved.ios.buildNumber).toBe(base.ios.buildNumber);
    expect(resolved.android.versionCode).toBe(Number(base.ios.buildNumber));
  });

  it('takes BUILD_NUMBER for both stores when set', () => {
    clearBuildEnv();
    process.env.BUILD_NUMBER = '42';
    const resolved = configure({ config: base });
    expect(resolved.ios.buildNumber).toBe('42');
    expect(resolved.android.versionCode).toBe(42);
  });

  it('rejects a build number neither store accepts', () => {
    clearBuildEnv();
    for (const bad of ['0', '1.2', 'abc', '2100000001']) {
      process.env.BUILD_NUMBER = bad;
      expect(() => configure({ config: base })).toThrow(/BUILD_NUMBER/);
    }
  });
});

// Every permission the app asks for at runtime needs its purpose string in the final Info.plist, or
// iOS terminates the app on the first request. Plugins can remove one another's strings (expo-camera's
// `microphonePermission: false` once deleted the one expo-speech-recognition sets), so this resolves the
// config the way prebuild does, with every plugin's mods, instead of reading app.json.
const REQUIRED_USAGE_STRINGS = [
  'NSCameraUsageDescription', // expo-camera: Pairing Code scanner
  'NSMicrophoneUsageDescription', // expo-speech-recognition: dictation
  'NSSpeechRecognitionUsageDescription', // expo-speech-recognition: dictation
  'NSFaceIDUsageDescription', // expo-local-authentication: app lock
  'NSLocalNetworkUsageDescription', // SSH to a Host on the local network
  // The system picker asks for nothing, but App Store Connect rejects the upload without the string
  // (error 90683): the linked picker code references the photo library.
  'NSPhotoLibraryUsageDescription', // expo-image-picker: attach a photo
];

interface Introspected extends ResolvedConfig {
  _internal?: {
    modResults?: {
      ios?: { expoPlist?: Record<string, unknown> };
      android?: {
        manifest?: {
          manifest: {
            application: { 'meta-data'?: { $: Record<string, string> }[] }[];
          };
        };
      };
    };
  };
}

/** The config as prebuild resolves it, every plugin's mods applied, with only `extraEnv` set. */
function introspect(extraEnv: Record<string, string> = {}): Introspected {
  // expo is a direct dependency, so pnpm links it into the app's own node_modules.
  const expoCli = path.join(root, 'node_modules', 'expo', 'bin', 'cli');
  const env: Record<string, string | undefined> = { ...process.env, EXPO_NO_TELEMETRY: '1' };
  for (const name of BUILD_ENV) delete env[name];
  const out = childProcess.execFileSync(
    process.execPath,
    [expoCli, 'config', '--type', 'introspect', '--json'],
    { cwd: root, encoding: 'utf8', env: { ...env, ...extraEnv } },
  );
  return JSON.parse(out) as Introspected;
}

describe('Expo config and the iOS purpose strings', () => {
  let infoPlist: Record<string, unknown>;
  beforeAll(() => {
    infoPlist = introspect().ios.infoPlist ?? {};
  }, 60_000);

  it.each(REQUIRED_USAGE_STRINGS)(
    'the resolved Info.plist carries %s with the app own copy',
    (key) => {
      const value = infoPlist[key];
      expect(typeof value).toBe('string');
      expect(value).not.toMatch(/^Allow \$\(PRODUCT_NAME\)/);
    },
  );

  it('no purpose string is a plugin default: App Review rejects generic ones', () => {
    const generic = Object.entries(infoPlist).filter(
      ([key, value]) =>
        key.endsWith('UsageDescription') &&
        typeof value === 'string' &&
        /^Allow \$\(PRODUCT_NAME\)/.test(value),
    );
    expect(generic).toEqual([]);
  });

  it.each(REQUIRED_USAGE_STRINGS)('the Spanish locale translates %s', (key) => {
    const es = JSON.parse(fs.readFileSync(path.join(root, 'locales', 'es.json'), 'utf8'));
    expect(typeof es.ios[key]).toBe('string');
  });
});

// Over-the-air updates (docs/guides/updates.md): only an official store build turns them on, and only
// with code signing. Everything else (a fork, a build from source, device installs, the simulator suite)
// never contacts an update server.
describe('Expo config and over-the-air updates', () => {
  const URL = 'https://updates.example.test/manifest';
  const LOOPBACK = 'http://127.0.0.1:8787/manifest';
  const hasLocalFile = fs.existsSync(path.join(root, 'app.local.json'));
  let dir: string;
  let cert: string;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'updates-config-'));
    cert = path.join(dir, 'cert.pem');
    // app.config.js only checks the file exists; prebuild embeds whatever it holds.
    fs.writeFileSync(cert, '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----\n');
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  const resolve = (env: Record<string, string>) => {
    clearBuildEnv();
    Object.assign(process.env, env);
    return configure({ config: base }).updates;
  };

  it('pins the runtime to the native fingerprint', () => {
    expect(base.runtimeVersion).toEqual({ policy: 'fingerprint' });
  });

  it('is off without the flag, even in a store build', () => {
    if (hasLocalFile) return; // the owner's file may carry the flag
    expect(resolve({})).toEqual({ enabled: false });
    expect(resolve({ APNS_ENVIRONMENT: 'production' })).toEqual({ enabled: false });
  });

  it('stays off in a development-signed build even with the flag (device installs, simulator)', () => {
    const env = { UPDATES_URL: LOOPBACK, UPDATES_CERTIFICATE: cert };
    expect(resolve({ ...env, APNS_ENVIRONMENT: 'development' })).toEqual({ enabled: false });
  });

  it('turns on in a store build with the flag, signed, checked at launch, never blocking it', () => {
    const updates = resolve({
      APNS_ENVIRONMENT: 'production',
      UPDATES_URL: LOOPBACK,
      UPDATES_CERTIFICATE: cert,
    });
    expect(updates).toMatchObject({
      enabled: true,
      url: LOOPBACK,
      codeSigningMetadata: { keyid: 'main', alg: 'rsa-v1_5-sha256' },
      checkAutomatically: 'ON_LOAD',
      fallbackToCacheTimeout: 0,
      enableBsdiffPatchSupport: false,
    });
    expect(fs.existsSync(path.join(root, String(updates?.codeSigningCertificate)))).toBe(true);
    expect(updates).not.toHaveProperty('requestHeaders');
  });

  it('refuses a store build with the flag and no certificate', () => {
    if (fs.existsSync(path.join(root, 'certs', 'updates.pem'))) return;
    expect(() => resolve({ APNS_ENVIRONMENT: 'production', UPDATES_URL: URL })).toThrow(
      /certificate/,
    );
  });

  it('takes a throwaway certificate only for a loopback server, and plain http only there', () => {
    const production = { APNS_ENVIRONMENT: 'production', UPDATES_CERTIFICATE: cert };
    expect(() => resolve({ ...production, UPDATES_URL: URL })).toThrow(/loopback/);
    expect(() => resolve({ ...production, UPDATES_URL: 'http://updates.example.test/m' })).toThrow(
      /https/,
    );
    expect(() => resolve({ ...production, UPDATES_URL: 'not a url' })).toThrow(/UPDATES_URL/);
  });

  describe('as prebuild writes it', () => {
    const expoPlist = (config: Introspected) => config._internal?.modResults?.ios?.expoPlist ?? {};
    const androidEnabled = (config: Introspected) =>
      config._internal?.modResults?.android?.manifest?.manifest.application[0]?.['meta-data']?.find(
        (item) => item.$['android:name'] === 'expo.modules.updates.ENABLED',
      )?.$['android:value'];

    it('a build from source: Expo.plist and the Android manifest say disabled', () => {
      if (hasLocalFile) return;
      const config = introspect();
      expect(expoPlist(config).EXUpdatesEnabled).toBe(false);
      expect(androidEnabled(config)).toBe('false');
    }, 60_000);

    it('an official build: iOS enabled with the certificate, Android still off (ADR 0028)', () => {
      const config = introspect({
        APNS_ENVIRONMENT: 'production',
        UPDATES_URL: LOOPBACK,
        UPDATES_CERTIFICATE: cert,
      });
      const plist = expoPlist(config);
      expect(plist.EXUpdatesEnabled).toBe(true);
      expect(plist.EXUpdatesURL).toBe(LOOPBACK);
      expect(plist.EXUpdatesCodeSigningCertificate).toMatch(/BEGIN CERTIFICATE/);
      expect(plist.EXUpdatesRuntimeVersion).toBe('file:fingerprint');
      expect(androidEnabled(config)).toBe('false');
    }, 60_000);
  });
});
