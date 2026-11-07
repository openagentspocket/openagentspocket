import { DictationController, type SpeechEngine } from './dictation';

function engine(granted = true) {
  let events: Parameters<SpeechEngine['start']>[0] | undefined;
  const fake: SpeechEngine = {
    requestPermission: async () => granted,
    start: (handlers) => {
      events = handlers;
    },
    stop: () => events?.onEnd(),
  };
  return { fake, emit: () => events as NonNullable<typeof events> };
}

describe('dictation into the draft', () => {
  it('inserts each finished phrase, with a space after it', async () => {
    const { fake, emit } = engine();
    const inserted: string[] = [];
    const dictation = new DictationController(fake, (text) => inserted.push(text));

    await dictation.toggle();
    expect(dictation.listening).toBe(true);
    emit().onFinal('fix the tests');
    emit().onFinal('   ');
    await dictation.toggle();

    expect(inserted).toEqual(['fix the tests ']);
    expect(dictation.listening).toBe(false);
  });

  it('never listens without permission, and tells the caller', async () => {
    const { fake } = engine(false);
    const failures: string[] = [];
    const dictation = new DictationController(
      fake,
      () => {},
      (reason) => failures.push(reason),
    );
    await dictation.toggle();
    expect(dictation.listening).toBe(false);
    expect(failures).toEqual(['permission']);
  });

  it('goes back to idle when the engine stops by itself, keeping what it heard', async () => {
    const { fake, emit } = engine();
    const inserted: string[] = [];
    const failures: string[] = [];
    const dictation = new DictationController(
      fake,
      (text) => inserted.push(text),
      (reason) => failures.push(reason),
    );
    await dictation.toggle();
    emit().onFinal('one');
    emit().onError();
    expect(dictation.listening).toBe(false);
    expect(inserted).toEqual(['one ']);
    expect(failures).toEqual(['stopped']);
  });
});
