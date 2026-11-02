import { type TerminalHandle, TerminalView, Text, useInsets, useTheme } from '@openagentspocket/ui';
import { useRef } from 'react';
import { View } from 'react-native';
import type { HarnessParams } from '../sshHarness';
import { useSpikeSession } from './useSpikeSession';

/**
 * Dev-only terminal renderer spike (ADR 0023): attaches a PTY on the local test Host, feeds the
 * libghostty renderer and runs the scenarios, posting each result to the harness fixture. Open
 * `agentico:///__terminal?...` with the SSH harness params. The xterm.js comparison was removed after
 * the decision (its code is in the P3.0 commits).
 */
export function TerminalSpikeScreen({
  params,
  autoRun,
}: {
  params: HarnessParams;
  autoRun: boolean;
}) {
  const theme = useTheme();
  const insets = useInsets();
  const term = useRef<TerminalHandle>(null);
  const { status, shrunk, onInput, onResize } = useSpikeSession(params, autoRun, term);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.canvas, paddingTop: insets.top }}>
      <Text variant="mono" tone="secondary" testID="terminal-spike-status">
        {`ghostty: ${status}`}
      </Text>
      <View style={{ flex: 1, marginBottom: shrunk ? 220 : 0 }}>
        <TerminalView
          ref={term}
          renderer="native"
          onInput={onInput}
          onResize={onResize}
          fontSize={13}
        />
      </View>
    </View>
  );
}
