import { type TerminalHandle, TerminalView, Text, useInsets, useTheme } from '@openagentspocket/ui';
import { useRef } from 'react';
import { View } from 'react-native';
import type { HarnessParams } from '../sshHarness';
import { useSpikeSession } from './useSpikeSession';
import { XtermTerminal } from './XtermTerminal';

/**
 * Dev-only terminal renderer spike (ADR 0023): attaches a PTY on the local test Host, feeds the
 * chosen renderer (`ghostty` or `xterm`) and runs the scenarios, posting each result to the
 * harness fixture. Open `agentico:///__terminal?renderer=ghostty&...` with the SSH harness params.
 */
export function TerminalSpikeScreen({
  params,
  renderer,
  autoRun,
}: {
  params: HarnessParams;
  renderer: 'ghostty' | 'xterm';
  autoRun: boolean;
}) {
  const theme = useTheme();
  const insets = useInsets();
  const term = useRef<TerminalHandle>(null);
  const { status, shrunk, onInput, onResize } = useSpikeSession(params, renderer, autoRun, term);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.canvas, paddingTop: insets.top }}>
      <Text variant="mono" tone="secondary" testID="terminal-spike-status">
        {`${renderer}: ${status}`}
      </Text>
      <View style={{ flex: 1, marginBottom: shrunk ? 220 : 0 }}>
        {renderer === 'xterm' ? (
          <XtermTerminal ref={term} onInput={onInput} onResize={onResize} fontSize={13} />
        ) : (
          <TerminalView
            ref={term}
            renderer="native"
            onInput={onInput}
            onResize={onResize}
            fontSize={13}
          />
        )}
      </View>
    </View>
  );
}
