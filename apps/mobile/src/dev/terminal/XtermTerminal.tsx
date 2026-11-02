import {
  createWriteBatcher,
  type TerminalHandle,
  type TerminalViewProps,
  useTheme,
} from '@openagentspocket/ui';
import { toBase64 } from 'agentico-ssh';
import {
  type ComponentType,
  type Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import type { WebViewMessageEvent, WebViewProps } from 'react-native-webview';
import { WebView as RawWebView } from 'react-native-webview';
import { xtermHtml } from './xtermHtml';

// react-native-webview's class typings resolve a second copy of @types/react; this is the same component.
interface WebHandle {
  injectJavaScript(js: string): void;
}
const WebView = RawWebView as unknown as ComponentType<WebViewProps & { ref?: Ref<WebHandle> }>;

/** Bytes the page confirmed parsing (xterm's write callback); the spike's render-lag signal. */
export const xtermStats = { parsed: 0 };

/** The WebView + xterm.js candidate behind the same props and handle as the native terminal. */
export function XtermTerminal({ onInput, onResize, fontSize = 13, ref }: TerminalViewProps) {
  const theme = useTheme();
  const web = useRef<WebHandle>(null);
  const ready = useRef(false);
  const queue = useRef<string[]>([]);

  const run = useCallback((js: string) => {
    if (ready.current) web.current?.injectJavaScript(`${js};true;`);
    else queue.current.push(js);
  }, []);
  const batcher = useMemo(
    () => createWriteBatcher((bytes) => run(`__w("${toBase64(bytes)}")`)),
    [run],
  );
  useEffect(() => () => batcher.dispose(), [batcher]);

  useImperativeHandle(
    ref,
    (): TerminalHandle => ({
      write: (data) => run(`__t(${JSON.stringify(data)})`),
      writeBytes: (bytes) => batcher.push(bytes),
      writeEncoded: (base64) => run(`__w("${base64}")`),
      clear: () => run('term.reset()'),
      focus: () => run('term.focus()'),
    }),
    [batcher, run],
  );

  const html = useMemo(
    () =>
      xtermHtml({
        fontSize,
        background: theme.colors.terminalBackground,
        foreground: theme.colors.terminalForeground,
      }),
    [fontSize, theme.colors.terminalBackground, theme.colors.terminalForeground],
  );

  const onMessage = (event: WebViewMessageEvent) => {
    const message = JSON.parse(event.nativeEvent.data);
    if (message.t === 'input') onInput?.(message.d);
    else if (message.t === 'parsed') xtermStats.parsed = message.n;
    else if (message.t === 'resize') onResize?.(message.cols, message.rows);
    else if (message.t === 'ready') {
      ready.current = true;
      for (const js of queue.current.splice(0)) web.current?.injectJavaScript(`${js};true;`);
      onResize?.(message.cols, message.rows);
    }
  };

  return (
    <WebView
      ref={web}
      originWhitelist={['*']}
      source={{ html }}
      onMessage={onMessage}
      style={{ flex: 1, backgroundColor: theme.colors.terminalBackground }}
      keyboardDisplayRequiresUserAction={false}
      hideKeyboardAccessoryView
      scrollEnabled={false}
      bounces={false}
      overScrollMode="never"
    />
  );
}
