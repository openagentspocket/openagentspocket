import {
  type CrashStorage,
  clearLastCrash,
  type ErrorHooks,
  installCrashRecorder,
  readLastCrash,
} from './crashRecorder';

function memoryStorage(): CrashStorage {
  const map = new Map<string, string>();
  return {
    getItemSync: (key) => map.get(key) ?? null,
    setItemSync: (key, value) => void map.set(key, value),
  };
}

function hooks(
  previous: jest.Mock,
): ErrorHooks & { fire: (error: unknown, fatal?: boolean) => void } {
  let current: (error: unknown, isFatal?: boolean) => void = previous;
  return {
    getGlobalHandler: () => current,
    setGlobalHandler: (handler) => {
      current = handler;
    },
    fire: (error, fatal) => current(error, fatal),
  };
}

describe('crash recorder', () => {
  it('records the error before handing it to the previous handler unchanged', () => {
    const previous = jest.fn();
    const storage = memoryStorage();
    const target = hooks(previous);
    installCrashRecorder(target, storage, () => 1000);
    const failure = new Error('rows is undefined');
    target.fire(failure, true);
    expect(previous).toHaveBeenCalledWith(failure, true);
    expect(readLastCrash(storage)).toMatchObject({
      at: 1000,
      message: 'rows is undefined',
      fatal: true,
    });
  });

  it('survives a storage that throws, and a cleared record reads as none', () => {
    const previous = jest.fn();
    const broken: CrashStorage = {
      getItemSync: () => null,
      setItemSync: () => {
        throw new Error('disk full');
      },
    };
    const target = hooks(previous);
    installCrashRecorder(target, broken);
    expect(() => target.fire('boom')).not.toThrow();
    expect(previous).toHaveBeenCalledTimes(1);
    const storage = memoryStorage();
    installCrashRecorder(hooks(jest.fn()), storage);
    clearLastCrash(storage);
    expect(readLastCrash(storage)).toBeUndefined();
  });
});
