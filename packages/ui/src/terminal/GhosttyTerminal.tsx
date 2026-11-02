import { toBase64 } from 'agentico-ssh';
import { TerminalView as GhosttyView, type TerminalViewRef } from 'expo-libghostty';
import { useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { useTheme } from '../theme/theme';
import type { TerminalHandle, TerminalViewProps } from './terminalTypes';
import { createWriteBatcher } from './writeBatcher';

const CLEAR = '\x1b[2J\x1b[3J\x1b[H';

/**
 * The native terminal (libghostty: Metal on iOS, a Canvas on Android). It renders the
 * bytes it is fed and reports typing and grid size; it owns the soft keyboard accessory,
 * selection and scrollback. Output is coalesced so a flood crosses the bridge in a few writes.
 */
export function GhosttyTerminal({ onInput, onResize, fontSize = 13, ref }: TerminalViewProps) {
  const theme = useTheme();
  const native = useRef<TerminalViewRef>(null);
  const batcher = useMemo(
    () =>
      createWriteBatcher((bytes) => {
        native.current?.write(toBase64(bytes)).catch(() => {});
      }),
    [],
  );
  useEffect(() => () => batcher.dispose(), [batcher]);

  useImperativeHandle(
    ref,
    (): TerminalHandle => ({
      write: (data) => {
        batcher.flush();
        native.current?.writeText(data).catch(() => {});
      },
      writeBytes: (bytes) => batcher.push(bytes),
      clear: () => {
        batcher.flush();
        native.current?.writeText(CLEAR).catch(() => {});
      },
      // The native view takes focus when touched; it has no imperative focus.
      focus: () => {},
    }),
    [batcher],
  );

  const colors = useMemo(
    () => ({
      background: theme.colors.terminalBackground,
      foreground: theme.colors.terminalForeground,
    }),
    [theme.colors.terminalBackground, theme.colors.terminalForeground],
  );

  return (
    <GhosttyView
      ref={native}
      style={{ flex: 1, backgroundColor: colors.background }}
      fontSize={fontSize}
      theme={colors}
      onInput={({ nativeEvent }) => onInput?.(nativeEvent.text)}
      onResize={({ nativeEvent }) => onResize?.(nativeEvent.cols, nativeEvent.rows)}
    />
  );
}
