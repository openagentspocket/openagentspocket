import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import Index from '@/app/index';
import { BannerLayer } from '@/notifications/InAppBanner';

const noop = () => {};

// iPhone 17 Pro: web has no safe area, so the atlas supplies the device's there.
const IPHONE_INSETS = { top: 59, bottom: 34, left: 0, right: 0 };

const BLOCKED = {
  target: { hostId: 'demo', paneId: 'p1' },
  status: 'blocked',
  title: 'agentico · claude',
  body: { key: 'Blocked' },
  question: 'Do you want to make this edit to AgenticoAppModel.swift?',
};

/**
 * The layer the app mounts over the whole window: here the route sits below the navigation
 * header, so the layer is lifted back to the window's top edge before the safe area applies.
 */
function WindowLayer() {
  const [top, setTop] = useState(0);
  const node = useRef<{ measureInWindow: (done: (x: number, y: number) => void) => void } | null>(
    null,
  );
  return (
    <View
      ref={(n) => {
        node.current = n;
      }}
      onLayout={() => node.current?.measureInWindow((_x, y) => setTop(y))}
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
    >
      <View style={[StyleSheet.absoluteFill, { top: -top }]} pointerEvents="box-none">
        <BannerLayer banner={BLOCKED} animated={false} onPress={noop} onDismiss={noop} />
      </View>
    </View>
  );
}

/** The Home console with the in-app banner pinned below the status bar: a blocked Agent's question. */
export function InAppBannerAtlas() {
  const device = useSafeAreaInsets();
  const content = (
    <>
      <Index />
      <WindowLayer />
    </>
  );
  if (device.top > 0) return content;
  return (
    <SafeAreaInsetsContext.Provider value={IPHONE_INSETS}>{content}</SafeAreaInsetsContext.Provider>
  );
}
