import { getLocaleTag } from '@openagentspocket/i18n';
import type { SpeechEngine } from './dictation';

type Speech = typeof import('expo-speech-recognition').ExpoSpeechRecognitionModule;

/** The native module, loaded on first use: a build without it has no Dictate entry, not a crash. */
function speechModule(): Speech | null {
  try {
    return (require('expo-speech-recognition') as typeof import('expo-speech-recognition'))
      .ExpoSpeechRecognitionModule;
  } catch {
    return null;
  }
}

/** The system recognizer in the phone's language; null where this build does not have it. */
export function systemSpeechEngine(): SpeechEngine | null {
  const speech = speechModule();
  if (!speech) return null;
  return {
    requestPermission: async () => (await speech.requestPermissionsAsync()).granted,
    start: (events) => {
      const listeners = [
        speech.addListener('result', (event) => {
          const text = event.results[0]?.transcript;
          if (event.isFinal && text) events.onFinal(text);
        }),
        speech.addListener('error', () => events.onError()),
        speech.addListener('end', () => {
          for (const listener of listeners) listener.remove();
          events.onEnd();
        }),
      ];
      speech.start({
        lang: getLocaleTag(),
        continuous: true,
        addsPunctuation: true,
      });
    },
    stop: () => speech.stop(),
  };
}
