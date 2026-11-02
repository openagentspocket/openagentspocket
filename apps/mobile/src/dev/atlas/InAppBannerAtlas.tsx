import { Modal } from 'react-native';
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
 * The Home console with the in-app banner pinned below the status bar: a blocked Agent's question.
 * The app mounts the layer over the whole window; a route cannot draw over the native header, so
 * the atlas lifts the layer into a transparent Modal, which does.
 */
export function InAppBannerAtlas() {
  const device = useSafeAreaInsets();
  const content = (
    <>
      <Index />
      <Modal transparent animationType="none" visible statusBarTranslucent>
        <BannerLayer banner={BLOCKED} animated={false} onPress={noop} onDismiss={noop} />
      </Modal>
    </>
  );
  if (device.top > 0) return content;
  return (
    <SafeAreaInsetsContext.Provider value={IPHONE_INSETS}>{content}</SafeAreaInsetsContext.Provider>
  );
}
