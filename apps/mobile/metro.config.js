// Metro config: Expo defaults plus the web stubs the UX atlas needs (see docs/agents/swarm.md "UX loop").
// On web only, native-only packages resolve to the files in src/dev/web, so the atlas bundle loads
// in a browser. iOS and Android resolve everything as usual.
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const stubs = path.join(__dirname, 'src/dev/web');

/** Package (or deep import) -> stub file in src/dev/web, web platform only. */
const WEB_STUBS = {
  'expo-sqlite/kv-store': 'kvStore.ts',
  'expo-file-system': 'fileSystem.ts',
};

const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const stub = platform === 'web' ? WEB_STUBS[moduleName] : undefined;
  if (stub) return { type: 'sourceFile', filePath: path.join(stubs, stub) };
  return (upstream ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
