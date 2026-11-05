import { defineConfig } from 'vitest/config';

// Tests import one module at a time: the program table comes from the package entry in the app.
export default defineConfig({ test: { setupFiles: ['./src/chat/programs/index.ts'] } });
