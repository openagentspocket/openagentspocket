import { t } from '@openagentspocket/i18n';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { type ErrorBoundaryProps, Stack } from 'expo-router';
import { Try } from 'expo-router/build/views/Try';
import { renderRouter } from 'expo-router/testing-library';
import { Text } from 'react-native';
import { type CrashStorage, readLastCrash } from './crashRecorder';
import { RenderErrorFallback } from './RenderErrorFallback';

function memoryStorage(): CrashStorage {
  const map = new Map<string, string>();
  return {
    getItemSync: (key) => map.get(key) ?? null,
    setItemSync: (key, value) => void map.set(key, value),
  };
}

// The child throws while `broken.now` is true: the first render fails, a retry after a fix renders.
const broken = { now: true };
function Fragile() {
  if (broken.now) throw new Error('rows is undefined');
  return <Text>Recovered</Text>;
}

// A route that always fails, and the fallback as the root layout exports it.
const fail = () => {
  throw new Error('rows is undefined');
};
const rootStorage = memoryStorage();
function RootBoundary(props: ErrorBoundaryProps) {
  return <RenderErrorFallback {...props} storage={rootStorage} />;
}

describe('RenderErrorFallback', () => {
  let quiet: jest.SpyInstance;
  beforeEach(() => {
    // React logs every caught render error; the test expects them.
    quiet = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    broken.now = true;
  });
  afterEach(() => quiet.mockRestore());

  it('shows the fallback, records the error, and renders the child again on Try Again', async () => {
    const storage = memoryStorage();
    await render(
      <Try catch={(props) => <RenderErrorFallback {...props} storage={storage} />}>
        <Fragile />
      </Try>,
    );
    expect(screen.getByTestId('render-error')).toBeTruthy();
    expect(screen.queryByText('Recovered')).toBeNull();
    expect(readLastCrash(storage)).toMatchObject({ message: 'rows is undefined', fatal: false });

    broken.now = false;
    await fireEvent.press(screen.getByRole('button'));
    expect(await screen.findByText('Recovered')).toBeTruthy();
    expect(screen.queryByTestId('render-error')).toBeNull();
  });

  describe('as the root layout ErrorBoundary, under the real router', () => {
    const routes = {
      _layout: {
        default: () => <Stack />,
        ErrorBoundary: RootBoundary,
        unstable_settings: { anchor: 'index' },
      },
      index: () => <Text>Home</Text>,
      broken: fail,
      'hosts/_layout': () => <Stack />,
      'hosts/index': fail,
    };
    const tryAgain = () => screen.getByRole('button', { name: t('Try Again') });
    const goHome = () => screen.queryByRole('button', { name: t('Go to Home') });

    it.each(['/broken', '/hosts'])(
      'leaves %s, opened into and only met again by Try Again, for Home',
      async (url) => {
        await renderRouter(routes, { initialUrl: url });
        expect(screen.getByTestId('render-error')).toBeTruthy();
        await fireEvent.press(tryAgain());
        expect(screen.getByTestId('render-error')).toBeTruthy();

        const home = goHome();
        if (!home) throw new Error('Go to Home is missing');
        await fireEvent.press(home);
        expect(await screen.findByText('Home')).toBeTruthy();
        expect(screen.queryByTestId('render-error')).toBeNull();
        expect(screen).toHavePathname('/');
      },
    );

    it('offers only Try Again when Home itself failed', async () => {
      await renderRouter({ ...routes, index: fail }, { initialUrl: '/' });
      expect(screen.getByTestId('render-error')).toBeTruthy();
      expect(tryAgain()).toBeTruthy();
      expect(goHome()).toBeNull();
    });
  });
});
