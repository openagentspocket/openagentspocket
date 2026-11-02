import { decideNavigation, type PageError } from '@openagentspocket/core';
import { makeStyles } from '@openagentspocket/ui';
import { type Ref, useImperativeHandle, useRef, useState } from 'react';
import { View } from 'react-native';
import WebView from 'react-native-webview';
import type {
  ShouldStartLoadRequest,
  WebViewErrorEvent,
  WebViewNavigation,
} from 'react-native-webview/lib/WebViewTypes';
import { isCancelledLoad } from './pageErrors';

const useStyles = makeStyles((t) => ({
  fill: { flex: 1, backgroundColor: t.colors.canvas },
}));

/** What the toolbar drives. */
export interface PreviewBrowserHandle {
  goBack(): void;
  goForward(): void;
  reload(): void;
}

export interface PreviewBrowserState {
  canGoBack: boolean;
  canGoForward: boolean;
  /** The page on screen, as the phone loads it (`127.0.0.1:<local port>`). */
  url: string | null;
}

interface PreviewWebViewProps {
  /** Where the page loads first: the tunnel's URL, or the page the user was on at its new port. */
  uri: string;
  /** The tunnel's port on the phone, and the server's port on the Host. */
  localPort: number;
  remotePort: number;
  ref?: Ref<PreviewBrowserHandle>;
  onState: (state: PreviewBrowserState) => void;
  onProgress: (progress: number | null) => void;
  onFailure: (error: PageError) => void;
  /** A link out of the Host's server, waiting for the user's answer. */
  onExternal: (url: string) => void;
  /** A response the web view cannot show (a download). */
  onDownload: () => void;
}

/**
 * The preview's web view: a non-persistent data store (a Host app's cookies and storage never
 * stay on the phone), no message handlers and no JavaScript bridge, and every top-level
 * navigation kept on the tunnel by `decideNavigation`.
 */
export function PreviewWebView({
  uri,
  localPort,
  remotePort,
  ref,
  onState,
  onProgress,
  onFailure,
  onExternal,
  onDownload,
}: PreviewWebViewProps) {
  const styles = useStyles();
  const web = useRef<WebView<object>>(null);
  // A link of the Host's own port is loaded through the tunnel by pointing the view at it.
  const [source, setSource] = useState(uri);
  useImperativeHandle(ref, () => ({
    goBack: () => web.current?.goBack(),
    goForward: () => web.current?.goForward(),
    reload: () => web.current?.reload(),
  }));

  const shouldLoad = (request: ShouldStartLoadRequest): boolean => {
    const decision = decideNavigation(request.url, {
      isMainFrame: request.isTopFrame,
      localPort,
      remotePort,
    });
    switch (decision.kind) {
      case 'allow':
        return true;
      case 'redirect':
        setSource(decision.url);
        return false;
      case 'external':
        onExternal(decision.url);
        return false;
      case 'cancel':
        return false;
    }
  };
  const reportState = (event: WebViewNavigation) => {
    onState({ canGoBack: event.canGoBack, canGoForward: event.canGoForward, url: event.url });
    if (!event.loading) onProgress(null);
  };
  const fail = (event: WebViewErrorEvent) => {
    const { code, domain, description } = event.nativeEvent;
    onProgress(null);
    onFailure({ cancelled: isCancelledLoad(code, domain), message: description });
  };

  return (
    <View style={styles.fill}>
      <WebView<object>
        ref={web}
        source={{ uri: source }}
        style={styles.fill}
        incognito
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        allowsBackForwardNavigationGestures
        onShouldStartLoadWithRequest={shouldLoad}
        onNavigationStateChange={reportState}
        onLoadProgress={(event) => onProgress(event.nativeEvent.progress)}
        onLoadEnd={() => onProgress(null)}
        onError={fail}
        onFileDownload={onDownload}
        testID="preview-webview"
      />
    </View>
  );
}
