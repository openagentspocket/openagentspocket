import { defineConfig } from 'vitest/config';

// No global setup file: a setup file joins every test's import graph, so `vitest related` on any
// file it reaches would run the whole suite. A test that reads the Chat program table imports
// `chat/programs` itself (the app gets it from the package entry); a missing import fails loudly
// ("Import chat/programs before reading a program definition").
export default defineConfig({ test: {} });
