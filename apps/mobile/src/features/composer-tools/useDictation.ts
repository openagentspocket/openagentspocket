import { t } from '@openagentspocket/i18n';
import { toast } from '@openagentspocket/ui';
import { useMemo, useRef, useSyncExternalStore } from 'react';
import { DictationController } from './dictation';
import { systemSpeechEngine } from './speechEngine';

const never = () => () => {};
const idle = () => false;

/** Dictation into the draft; `toggle` is undefined where this build has no recognizer. */
export function useDictation(insert: (text: string) => void) {
  const latest = useRef(insert);
  latest.current = insert;
  const controller = useMemo(() => {
    const engine = systemSpeechEngine();
    return engine
      ? new DictationController(
          engine,
          (text) => latest.current(text),
          (reason) =>
            toast({
              title:
                reason === 'permission'
                  ? t('Microphone access is off. Turn it on in Settings to dictate.')
                  : t('Dictation stopped unexpectedly.'),
            }),
        )
      : null;
  }, []);
  const listening = useSyncExternalStore(
    controller?.subscribe ?? never,
    controller?.getSnapshot ?? idle,
    controller?.getSnapshot ?? idle,
  );
  const toggle = useMemo(
    () => (controller ? () => void controller.toggle() : undefined),
    [controller],
  );
  return { listening, toggle };
}
