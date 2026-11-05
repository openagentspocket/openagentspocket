// Tests run at the default text size. React Native's jest preset reports a font scale of 2,
// an accessibility size, where status marks draw as glyphs; a test that wants one calls
// setFontScale from src/test-utils. Used by this package's and the app's jest configs.
const { setFontScale } = require('./src/test-utils');

beforeEach(() => setFontScale(1));

// The first render of a screen in a worker pays module loading; under `pnpm test` every package
// runs at once and that alone can pass RNTL's 1 s default for waitFor/findBy (FilesScreen did).
require('@testing-library/react-native').configure({ asyncUtilTimeout: 5000 });

// Agents run their tests side by side on one machine; a render-heavy test (the component catalog,
// the agent detail screen) can take well over jest's 5 s default without anything being wrong.
jest.setTimeout(30_000);

// The native sheet has no Jest runtime: `Sheet` falls back to its JS host when this import throws.
jest.mock(
  '@lodev09/react-native-true-sheet',
  () => {
    throw new Error('native only');
  },
  { virtual: true },
);
