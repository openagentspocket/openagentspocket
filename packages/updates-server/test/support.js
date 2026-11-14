// Test fixtures for the publish tooling: a throwaway RSA key pair and code signing certificate made
// with openssl inside the test's own temp directory at test time (never committed, deleted after),
// and a fake `npx expo export` folder.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const RUNTIME = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
export const BUILDS = [
  {
    platform: 'ios',
    version: '1.0.2',
    build: '4',
    runtimeVersion: RUNTIME,
    commit: 'c'.repeat(40),
    archivedAt: '2026-11-01T00:00:00.000Z',
  },
];

export function tempDir(prefix = 'updates-') {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** A key file and a matching certificate with the code signing EKU, as expo's generator makes. */
export function makeKeyPair(dir, name = 'test') {
  const key = join(dir, `${name}-key.pem`);
  const cert = join(dir, `${name}-cert.pem`);
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      key,
      '-out',
      cert,
      '-days',
      '2',
      '-subj',
      `/CN=${name}`,
      '-addext',
      'extendedKeyUsage=codeSigning',
      '-addext',
      'keyUsage=critical,digitalSignature',
    ],
    { stdio: 'ignore' },
  );
  return { key, cert };
}

/** An export folder like `npx expo export --platform ios` writes: metadata.json, bundle, assets. */
export function makeExport(dir) {
  const root = join(dir, 'export');
  mkdirSync(join(root, '_expo/static/js/ios'), { recursive: true });
  mkdirSync(join(root, 'assets'), { recursive: true });
  const bundle = '_expo/static/js/ios/entry-0123456789abcdef.hbc';
  writeFileSync(join(root, bundle), 'HBC bytecode stand-in é');
  writeFileSync(join(root, 'assets/1111'), 'png bytes one');
  writeFileSync(join(root, 'assets/2222'), 'ttf bytes two');
  const metadata = {
    version: 0,
    bundler: 'metro',
    fileMetadata: {
      ios: {
        bundle,
        assets: [
          { path: 'assets/1111', ext: 'png' },
          { path: 'assets/2222', ext: 'ttf' },
        ],
      },
    },
  };
  writeFileSync(join(root, 'metadata.json'), JSON.stringify(metadata));
  return root;
}
