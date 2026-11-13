import { type ReactNode, useEffect, useRef } from 'react';
import { Animated, Modal, StyleSheet } from 'react-native';
import { loadWindowOverlay } from './loadWindowOverlay';

const FADE_MS = 200;

/**
 * Where an alert is drawn: over whatever is on screen, route sheets and native sheets included.
 * iOS draws it in the window above every presented controller (see `loadWindowOverlay`); Android
 * and web use a `Modal`, which is its own window or portal there. `onRequestClose` is Android's
 * back button.
 */
export function AlertLayer({
  visible,
  onRequestClose,
  children,
}: {
  visible: boolean;
  onRequestClose: () => void;
  children: ReactNode;
}) {
  const Overlay = loadWindowOverlay();
  if (Overlay) {
    return visible ? (
      <Overlay unstable_accessibilityContainerViewIsModal>
        <FadeIn>{children}</FadeIn>
      </Overlay>
    ) : null;
  }
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onRequestClose}
    >
      {children}
    </Modal>
  );
}

/** The fade the Modal gives, for the window overlay. */
function FadeIn({ children }: { children: ReactNode }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: FADE_MS, useNativeDriver: true }).start();
  }, [opacity]);
  return <Animated.View style={[StyleSheet.absoluteFill, { opacity }]}>{children}</Animated.View>;
}
