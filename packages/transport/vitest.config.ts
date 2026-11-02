import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// agentico-ssh's index imports `expo` for the native client; tests only use the fake, so the
// native entry point is stubbed.
export default defineConfig({
  resolve: {
    alias: { expo: fileURLToPath(new URL('./test/expo-stub.ts', import.meta.url)) },
  },
});
