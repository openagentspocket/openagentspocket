import { hostUrl, type PortsStore, parseUrl, tunnelUrl } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { confirm, makeStyles, type ScreenHeader, useStoreState } from '@openagentspocket/ui';
import { useEffect, useRef, useState } from 'react';
import { Linking, Share, View } from 'react-native';
import { AppScreen } from '@/navigation/AppScreen';
import { askLeavePreview } from './leaveDialog';
import { PreviewStates } from './PreviewStates';
import { PreviewToolbar } from './PreviewToolbar';
import {
  type PreviewBrowserHandle,
  type PreviewBrowserState,
  PreviewWebView,
} from './PreviewWebView';

const useStyles = makeStyles((th) => ({
  body: { flex: 1 },
  progress: { position: 'absolute', top: 0, left: 0, height: 2, backgroundColor: th.colors.accent },
}));

/**
 * browser.preview: one Host server in a web view through the loopback tunnel. Leaving the screen
 * stops the tunnel. Share hands on the page as the Host serves it (`http://localhost:<port>/…`):
 * the phone's loopback URL means nothing outside the preview.
 */
export function PortPreviewScreen({
  store,
  title,
  onClose,
}: {
  store: PortsStore;
  /** `host:port`, shown in the slim top bar. */
  title?: string;
  onClose?: () => void;
}) {
  const styles = useStyles();
  const { preview } = useStoreState(store);
  const browser = useRef<PreviewBrowserHandle>(null);
  const [state, setState] = useState<PreviewBrowserState>({
    canGoBack: false,
    canGoForward: false,
    url: null,
  });
  const [progress, setProgress] = useState<number | null>(null);
  // The page on screen survives a reopen: a restart may bind another phone port, and the page
  // moves with it.
  const lastUrl = useRef<string | null>(null);
  if (state.url) lastUrl.current = state.url;

  useEffect(() => () => store.closePreview(), [store]);
  const loadId = preview?.loadId;
  // A reopened page starts a fresh history.
  useEffect(() => {
    if (loadId !== undefined) setState((s) => ({ ...s, canGoBack: false, canGoForward: false }));
  }, [loadId]);

  const phase = preview?.phase;
  const port = preview?.target.port ?? 0;
  const open = phase?.kind === 'open' ? phase : null;

  const askExternal = async (url: string) => {
    if (await askLeavePreview(parseUrl(url)?.host ?? url, store.hostName)) {
      void Linking.openURL(url);
    }
  };
  const noDownloads = () =>
    void confirm({
      title: t('Downloads Not Supported'),
      message: t('The preview shows pages only; it cannot download files yet.'),
      cancelLabel: null,
    });

  const bar: ScreenHeader = {
    variant: 'sheet',
    title: title ?? store.hostName,
    leading: {
      label: t('Close'),
      icon: 'close',
      onPress: onClose ?? (() => {}),
      testID: 'preview-close',
    },
  };
  // Nothing is open (the list was left, or the route was opened cold): the route is popping.
  if (!preview)
    return (
      <AppScreen scroll={false} testID="preview-screen">
        {null}
      </AppScreen>
    );
  return (
    <AppScreen scroll={false} header={bar} testID="preview-screen">
      <View style={styles.body}>
        {open ? (
          <PreviewWebView
            key={preview.loadId}
            ref={browser}
            uri={(lastUrl.current && tunnelUrl(lastUrl.current, open.localPort)) || open.url}
            localPort={open.localPort}
            remotePort={port}
            onState={setState}
            onProgress={setProgress}
            onFailure={(error) => store.pageDidFail(error)}
            onExternal={askExternal}
            onDownload={noDownloads}
          />
        ) : (
          <PreviewStates phase={phase} port={port} onRetry={() => store.retry()} />
        )}
        {open && progress !== null ? (
          <View
            style={[styles.progress, { width: `${Math.round(progress * 100)}%` }]}
            testID="preview-progress"
          />
        ) : null}
      </View>
      <PreviewToolbar
        isOpen={open !== null}
        canGoBack={state.canGoBack}
        canGoForward={state.canGoForward}
        isOpening={phase?.kind === 'opening'}
        onBack={() => browser.current?.goBack()}
        onForward={() => browser.current?.goForward()}
        onReload={() => {
          if (open) browser.current?.reload();
          else store.retry();
        }}
        onShare={() => void Share.share({ message: hostUrl(state.url, port) })}
      />
    </AppScreen>
  );
}
