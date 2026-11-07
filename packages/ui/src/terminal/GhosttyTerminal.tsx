import { isWheelReport } from '@openagentspocket/core';
import { toBase64, utf8Encode } from 'agentico-ssh';
import { TerminalView as GhosttyView, type TerminalViewRef } from 'expo-libghostty';
import { useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { useTerminalColors } from './TerminalThemeContext';
import type { TerminalHandle, TerminalViewProps } from './terminalTypes';
import { createWriteBatcher } from './writeBatcher';

const CLEAR = '\x1b[2J\x1b[3J\x1b[H';

/**
 * The native terminal (libghostty: Metal on iOS, a Canvas on Android). It renders the
 * bytes it is fed and reports typing and grid size; it owns the soft keyboard accessory,
 * selection and scrollback. Output is coalesced so a flood crosses the bridge in a few writes.
 */
export function GhosttyTerminal({ onInput, onResize, fontSize = 13, ref }: TerminalViewProps) {
  const surface = useTerminalColors();
  const native = useRef<TerminalViewRef>(null);
  const batcher = useMemo(
    () => createWriteBatcher((bytes) => native.current?.write(toBase64(bytes)).catch(() => {})),
    [],
  );
  useEffect(() => () => batcher.dispose(), [batcher]);

  useImperativeHandle(
    ref,
    (): TerminalHandle => ({
      write: (data) => batcher.push(utf8Encode(data)),
      writeEncoded: (base64) => {
        native.current?.write(base64).catch(() => {});
      },
      writeBytes: (bytes) => batcher.push(bytes),
      clear: () => batcher.push(utf8Encode(CLEAR)),
      // The native view takes focus when touched; it has no imperative focus.
      focus: () => {},
    }),
    [batcher],
  );

  const colors = useMemo(
    () => ({
      background: surface.background,
      foreground: surface.foreground,
      palette: surface.palette ? [...surface.palette] : undefined,
    }),
    [surface],
  );

  return (
    <GhosttyView
      ref={native}
      style={{ flex: 1, backgroundColor: colors.background }}
      fontSize={fontSize}
      theme={colors}
      onInput={({ nativeEvent }) => {
        if (!isWheelReport(nativeEvent.text)) onInput?.(nativeEvent.text);
      }}
      onResize={({ nativeEvent }) => onResize?.(nativeEvent.cols, nativeEvent.rows)}
    />
  );
}
