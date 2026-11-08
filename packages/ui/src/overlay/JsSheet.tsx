import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { quick, useReducedMotion } from '../motion';
import { Tappable } from '../primitives/Tappable';
import { useInsets } from '../theme/insets';
import { makeStyles, useTheme } from '../theme/theme';
import { SheetAlertHost, SheetBody } from './SheetBody';
import { detentShare, useSheetDrag } from './sheetDetents';
import type { SheetProps } from './sheetTypes';

const useStyles = makeStyles((t) => ({
  root: { flex: 1, justifyContent: 'flex-end' },
  // The scrim covers the whole window, also beside and under a floating panel.
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: t.backdrop,
  },
  // The same surface and edge as a native route sheet: the canvas with its glow, no border.
  panel: {
    backgroundColor: t.colors.canvas,
    overflow: 'hidden',
    borderTopLeftRadius: t.metrics.sheetRadius,
    borderTopRightRadius: t.metrics.sheetRadius,
    maxWidth: t.metrics.readableWidth,
    alignSelf: 'center',
  },
  full: { width: '100%' },
  fits: { maxHeight: '100%' },
  dragArea: { alignItems: 'center', paddingBottom: t.spacing.xs },
  grabber: {
    alignSelf: 'center',
    width: t.metrics.sheetGrabberWidth,
    height: t.metrics.sheetGrabberHeight,
    borderRadius: t.metrics.sheetGrabberHeight / 2,
    backgroundColor: t.colors.control,
    marginTop: t.spacing.xs,
  },
}));

/** The JS host of a sheet (web, tests and where the native one is not available). */
export function JsSheet(props: SheetProps) {
  const { visible, onClose, onDismissed, detent = 'fit', grabber = true, testID = 'sheet' } = props;
  const styles = useStyles();
  const insets = useInsets();
  const { metrics } = useTheme();
  const { height } = useWindowDimensions();
  const drag = useSheetDrag(detent, onClose, visible);
  const live = drag.detent;
  const share = detentShare(live);
  const limit = height * metrics.sheetMaxShare;
  const grown = Math.min(limit, Math.max(height * 0.2, height * share + drag.offset));
  const size =
    live === 'fit'
      ? { maxHeight: height * share, minHeight: height * metrics.sheetMinShare }
      : { height: grown };
  // The Modal never animates itself (its slide would carry the scrim up with the panel): the scrim
  // fades and only the panel rises, on one progress value, for every sheet.
  const reduce = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);
  useEffect(() => {
    if (visible && !mounted) {
      progress.setValue(0);
      setMounted(true);
      return;
    }
    if (!mounted) return;
    // Reduce Motion, and the web (the gallery and atlas have no native frame loop to wait for): jump.
    if (reduce || Platform.OS === 'web') {
      progress.setValue(visible ? 1 : 0);
      if (!visible) setMounted(false);
      return;
    }
    const animation = quick(progress, visible ? 1 : 0, reduce, visible ? 'overlay' : 'settle');
    animation.start(({ finished }) => {
      if (!visible && finished) setMounted(false);
    });
    return () => animation.stop();
  }, [visible, mounted, reduce, progress]);
  // Every platform reports the end of the close: the Modal's own onDismiss is iOS only.
  const wasMounted = useRef(mounted);
  const dismissed = useRef(onDismissed);
  dismissed.current = onDismissed;
  useEffect(() => {
    if (wasMounted.current && !mounted) dismissed.current?.();
    wasMounted.current = mounted;
  }, [mounted]);
  const rise = progress.interpolate({ inputRange: [0, 1], outputRange: [height, 0] });
  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        // The status bar's height stays free and the panel never outgrows what is left, so a sheet
        // lifted by the keyboard stops under the status bar instead of passing through it.
        style={[styles.root, { paddingTop: insets.top }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Animated.View style={[styles.backdrop, { opacity: progress }]}>
          <Tappable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            accessibilityElementsHidden
            importantForAccessibility="no"
            testID={`${testID}-backdrop`}
          />
        </Animated.View>
        <Animated.View
          style={[
            styles.panel,
            styles.full,
            size,
            styles.fits,
            { paddingBottom: insets.bottom, transform: [{ translateY: rise }] },
          ]}
          accessibilityViewIsModal
          testID={testID}
        >
          <SheetBody
            sheet={props}
            fit={live === 'fit'}
            top={
              grabber ? (
                <View style={styles.dragArea} {...drag.handlers} testID={`${testID}-grabber`}>
                  <View style={styles.grabber} />
                </View>
              ) : null
            }
          />
        </Animated.View>
      </KeyboardAvoidingView>
      {/* iOS cannot present the app's alert over this modal; its own host takes over while open. */}
      <SheetAlertHost testID={testID} />
    </Modal>
  );
}
