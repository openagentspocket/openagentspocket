import {
  type CrashStorage,
  clearLastCrash,
  type ErrorHooks,
  type ExceptionReporter,
  installCrashRecorder,
  installFatalReportRecorder,
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

describe('installFatalReportRecorder', () => {
  const memory = () => {
    const values = new Map<string, string>();
    return {
      getItemSync: (key: string) => values.get(key) ?? null,
      setItemSync: (key: string, value: string) => void values.set(key, value),
    };
  };

  it('keeps a fatal report and still passes it on', () => {
    const storage = memory();
    const seen: unknown[] = [];
    const reporter: ExceptionReporter = { reportException: (data) => void seen.push(data) };
    installFatalReportRecorder(reporter, storage, () => 5);
    reporter.reportException({
      message: 'boom',
      isFatal: true,
      stack: [{ methodName: 'f', file: 'a.js', lineNumber: 2 }],
    });
    expect(readLastCrash(storage)).toMatchObject({ at: 5, message: 'boom', fatal: true });
    expect(seen).toHaveLength(1);
  });

  it('ignores a report that is not fatal', () => {
    const storage = memory();
    const reporter: ExceptionReporter = { reportException: () => undefined };
    installFatalReportRecorder(reporter, storage);
    reporter.reportException({ message: 'soft', isFatal: false });
    expect(readLastCrash(storage)).toBeUndefined();
  });
});
