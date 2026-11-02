// Regenerates Expo Router's typed routes (apps/mobile/.expo/types/router.d.ts) without starting Metro, so
// `tsc -b` checks hrefs against the current route files in every checkout. Expo only writes this file
// when the dev server starts, which left fresh worktrees untyped and main with stale routes.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const mobile = path.resolve(import.meta.dirname, '../apps/mobile');
// pnpm keeps @expo/router-server private to expo-router, so resolve it from there.
const fromMobile = createRequire(path.join(mobile, 'package.json'));
const require = createRequire(fromMobile.resolve('expo-router/package.json'));
const typesDirectory = path.join(mobile, '.expo/types');

process.env.EXPO_ROUTER_APP_ROOT = path.join(mobile, 'src/app');
mkdirSync(typesDirectory, { recursive: true });
writeFileSync(
  path.join(mobile, 'expo-env.d.ts'),
  '/// <reference types="expo/types" />\n\n// NOTE: This file should not be edited and should be in your git ignore',
);
const typedRoutes = require('@expo/router-server/build/typed-routes');
typedRoutes.regenerateDeclarations(typesDirectory, {});
