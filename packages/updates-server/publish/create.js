// Building a signed update bundle (a manifest from an export, or a rollBackToEmbedded directive):
// refuse what no released build can run, sign, verify the signature against the certificate before
// anything is written, write the bundle, then verify the written bundle as the client would.
import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { writeBundle } from './bundle.js';
import { buildManifest, buildRollBackDirective, sha256Hex } from './manifest.js';
import { keyMatchesCertificate, signatureProblem, signBytes } from './signing.js';
import { verifyBundle } from './verify.js';

// iOS first (ADR 0028, decided 2026-11-14): Android is not published to until its client's
// handling of a missing or bad signature is verified on a device.
export const PUBLISH_PLATFORMS = ['ios'];

// A bundle made for the local end-to-end test (throwaway key, test builds record) says so; the real
// upload refuses it.
const localMark = ({ localTest }) => (localTest ? { localTest: true } : {});

function preflight({ outDir, platform, runtimeVersion, builds, privateKey, certificate }) {
  if (!PUBLISH_PLATFORMS.includes(platform))
    throw new Error(`publishing for ${platform} is not enabled (ADR 0028: iOS first)`);
  if (!builds.some((b) => b.platform === platform && b.runtimeVersion === runtimeVersion))
    throw new Error(
      `runtime ${runtimeVersion} matches no released ${platform} build in docs/releases/builds.json: ` +
        'no device could run this update (a native change needs a store release first)',
    );
  if (!keyMatchesCertificate(privateKey, certificate))
    throw new Error('the key does not belong to the certificate; nothing was written');
  if (existsSync(outDir) && readdirSync(outDir).length)
    throw new Error(`${outDir} already exists and is not empty`);
}

async function seal({
  outDir,
  kind,
  bytes,
  files,
  entryFields,
  privateKey,
  certificate,
  keyId,
  builds,
  log,
}) {
  const signature = signBytes(bytes, privateKey, keyId);
  const bad = signatureProblem({ bytes, header: signature, certificate, keyId });
  if (bad) throw new Error(`the fresh signature does not verify (${bad}); nothing was written`);
  const entry = { kind, ...entryFields, bodySha256: sha256Hex(bytes), signature };
  writeBundle(outDir, { entry, bytes, signature, files });
  const { problems } = await verifyBundle(outDir, { certificate, keyId, builds, log });
  if (problems.length) {
    rmSync(outDir, { recursive: true, force: true });
    throw new Error(`the bundle failed verification and was removed:\n- ${problems.join('\n- ')}`);
  }
  return entry;
}

/**
 * @param {{outDir: string, exported: ReturnType<import('./manifest.js').readExport>, platform: string,
 *   runtimeVersion: string, builds: object[], log: object[], baseUrl: string, expoClient: object,
 *   commit: string, privateKey: import('node:crypto').KeyObject,
 *   certificate: import('node:crypto').X509Certificate, keyId?: string, now?: Date, id?: string}} input
 */
export async function createUpdateBundle(input) {
  preflight(input);
  const { now = new Date(), id = randomUUID(), platform, runtimeVersion, commit } = input;
  const createdAt = now.toISOString();
  const { manifest, bytes, files } = buildManifest({ ...input, id, createdAt });
  const entry = await seal({
    ...input,
    kind: 'manifest',
    bytes,
    files,
    entryFields: { id, platform, runtimeVersion, createdAt, commit, ...localMark(input) },
  });
  return { entry, manifest, bytes };
}

/** A signed rollBackToEmbedded directive for one runtime version (the emergency tool; prefer republishing). */
export async function createRollbackBundle(input) {
  preflight(input);
  const { now = new Date(), id = randomUUID(), platform, runtimeVersion, commit } = input;
  const commitTime = now.toISOString();
  const { bytes } = buildRollBackDirective(commitTime);
  const entry = await seal({
    ...input,
    kind: 'directive',
    bytes,
    files: [],
    entryFields: {
      id,
      platform,
      runtimeVersion,
      createdAt: commitTime,
      commit,
      ...localMark(input),
    },
  });
  return { entry, bytes };
}
