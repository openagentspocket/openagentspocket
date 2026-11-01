const { transformIgnorePatterns } = require('jest-expo/jest-preset');

// jest-expo's allowlist plus the ESM-only libraries the UI package ships (FlashList, marked).
const ESM_LIBS = ['@shopify/flash-list', 'marked'];

module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/src/**/*.test.{ts,tsx}'],
  transformIgnorePatterns: transformIgnorePatterns.map((pattern) =>
    pattern.startsWith('/node_modules/(?!(')
      ? pattern.replace('(?!(', `(?!(${ESM_LIBS.join('|')}|`)
      : pattern,
  ),
};
