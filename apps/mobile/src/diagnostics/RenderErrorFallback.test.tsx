import { fireEvent, render, screen } from '@testing-library/react-native';
import { Try } from 'expo-router/build/views/Try';
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
});
