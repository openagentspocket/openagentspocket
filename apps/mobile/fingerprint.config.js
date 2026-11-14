// The runtime version is the fingerprint of the native side (docs/decisions/0028-over-the-air-updates.md,
// Runtime version). Loaded by @expo/fingerprint wherever it runs: the iOS build phase that embeds the
// runtime, `expo-updates runtimeversion:resolve`, and scripts/lib/runtime-version.mjs.
//
// - extraSources: the default only hashes a `patches/` folder inside apps/mobile; the pnpm patches live
//   at the repository root, so they are added here and a patch change changes the runtime.
// - fileHookTransform: the resolved Expo config is hashed, and app.config.js adds `updates` only in an
//   official build (UPDATES_URL). Those fields say where updates come from and how they are signed,
//   not what JS the binary can run, so they are left out: an official build, a build from source and
//   the release scripts (which never see the update URL) all compute the same runtime version.
/** @type {import('expo/fingerprint').Config} */
module.exports = {
  extraSources: [{ type: 'dir', filePath: '../../patches', reasons: ['pnpmPatches'] }],
  fileHookTransform: (source, chunk) => {
    if (source.type !== 'contents' || source.id !== 'expoConfig' || typeof chunk !== 'string') {
      return chunk;
    }
    const { updates: _updates, ...config } = JSON.parse(chunk);
    return JSON.stringify(config);
  },
};
