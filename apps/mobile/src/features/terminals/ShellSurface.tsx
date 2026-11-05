import type { AttachStatus, PoolEntry } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import {
  Button,
  EmptyState,
  makeStyles,
  TerminalView,
  useAttachedTerminal,
} from '@openagentspocket/ui';
import { useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';
import { renderMessage } from '@/lib/renderText';
import { TerminalZoom } from '@/terminal/TerminalZoom';

const useStyles = makeStyles((th) => ({
  fill: { flex: 1 },
  overlay: { backgroundColor: th.backdrop },
}));

function Overlay({ status, store }: { status: AttachStatus; store: PoolEntry['store'] }) {
  const styles = useStyles();
  if (status.kind === 'live') return null;
  const ended = status.kind === 'ended';
  return (
    <View style={[StyleSheet.absoluteFill, styles.overlay]} testID="terminal-status">
      <EmptyState
        icon={ended ? 'warning' : 'terminal'}
        title={ended ? t('Terminal Closed') : t('Opening Terminal…')}
        message={ended ? renderMessage(status.message) : undefined}
        testID={ended ? 'terminal-ended' : 'terminal-connecting'}
        actions={
          ended ? (
            <>
              <Button title={t('Reattach')} onPress={() => store.retryTerminal()} />
              <Button
                kind="secondary"
                title={t('Take Over')}
                onPress={() => store.takeOverTerminal()}
              />
            </>
          ) : undefined
        }
      />
    </View>
  );
}

/** The shell's terminal view and its connection overlay. The view is keyed by pipeline surface. */
export function ShellSurface({ entry }: { entry: PoolEntry }) {
  const styles = useStyles();
  const { store } = entry;
  // A replacement pipeline (Host generation, take over) is a new surface and a new view.
  useSyncExternalStore(store.subscribe, store.getVersion);
  const terminal = useAttachedTerminal(store.terminal);
  return (
    <View style={styles.fill} testID="shell-terminal">
      <TerminalZoom>
        {(fontSize) => (
          <TerminalView
            key={terminal.snapshot.surfaceId}
            accessibilityLabel={t('Terminal')}
            testID="shell-terminal-view"
            fontSize={fontSize}
            {...terminal.viewProps}
          />
        )}
      </TerminalZoom>
      <Overlay status={store.terminalStatus} store={store} />
    </View>
  );
}
