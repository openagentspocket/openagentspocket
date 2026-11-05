import { Modal } from 'react-native';
import Index from '@/app/index';
import { BannerLayer } from '@/notifications/InAppBanner';

const noop = () => {};

const BLOCKED = {
  target: { hostId: 'demo', paneId: 'p1' },
  status: 'blocked',
  title: 'agentico · claude',
  body: { key: 'Blocked' },
  question: 'Do you want to make this edit to AgenticoAppModel.swift?',
};

/**
 * The Home console with the in-app banner pinned at the top: a blocked Agent's question.
 * The app mounts the layer over the whole window; a route cannot draw over the native header, so
 * the atlas lifts the layer into a transparent Modal, which does.
 */
export function InAppBannerAtlas() {
  // Web has no status bar: the layer pins 4 pt from the top, which still covers the header row.
  return (
    <>
      <Index />
      <Modal transparent animationType="none" visible statusBarTranslucent>
        <BannerLayer banner={BLOCKED} animated={false} onPress={noop} onDismiss={noop} />
      </Modal>
    </>
  );
}
