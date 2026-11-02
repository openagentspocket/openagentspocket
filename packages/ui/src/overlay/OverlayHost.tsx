import { AlertHost } from './AlertHost';
import { ToastHost } from './ToastHost';

/**
 * Presents confirm() and toast() requests. Mount once at the root, after the
 * navigator, inside ThemeProvider and SafeAreaProvider. A screen may mount its
 * own (the gallery does, to draw in its theme); the most recent one presents.
 */
export function OverlayHost() {
  return (
    <>
      <ToastHost />
      <AlertHost />
    </>
  );
}
