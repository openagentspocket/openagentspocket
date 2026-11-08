const { transformIgnorePatterns } = require('jest-expo/jest-preset');

// jest-expo's allowlist plus the ESM-only libraries the UI package ships (marked).
const ESM_LIBS = ['marked'];

module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/src/**/*.test.{ts,tsx}'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  transformIgnorePatterns: transformIgnorePatterns.map((pattern) =>
    pattern.startsWith('/node_modules/(?!(')
      ? pattern.replace('(?!(', `(?!(${ESM_LIBS.join('|')}|`)
      : pattern,
  ),
};
