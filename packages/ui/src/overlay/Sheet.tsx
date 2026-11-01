import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { Button } from '../primitives/Button';
import { Text } from '../primitives/Text';
import { useInsets } from '../theme/insets';
import { makeStyles } from '../theme/theme';
import { OverlayHost } from './OverlayHost';

/** medium: half the screen; large: nearly all of it; fit: as tall as its content. */
export type SheetDetent = 'medium' | 'large' | 'fit';

const DETENT_SHARE: Record<SheetDetent, number> = { medium: 0.5, large: 0.92, fit: 0.92 };

const useStyles = makeStyles((t) => ({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { flex: 1, backgroundColor: t.backdrop },
  panel: {
    backgroundColor: t.colors.surfaceOverlay,
    borderTopLeftRadius: t.metrics.sheetRadius,
    borderTopRightRadius: t.metrics.sheetRadius,
    borderWidth: t.metrics.hairlineWidth,
    borderBottomWidth: 0,
    borderColor: t.hairline,
    width: '100%',
    maxWidth: t.metrics.readableWidth,
    alignSelf: 'center',
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: t.colors.control,
    marginTop: t.spacing.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xs,
    paddingLeft: t.metrics.screenInset,
    paddingRight: t.spacing.xs,
    minHeight: t.metrics.minTapSize,
  },
  title: { flex: 1 },
  body: { paddingHorizontal: t.metrics.screenInset, paddingTop: t.spacing.xs, gap: t.spacing.md },
}));

interface SheetProps {
  visible: boolean;
  /** Called on the close button, a backdrop tap and the Android back button. */
  onClose: () => void;
  title?: string;
  detent?: SheetDetent;
  /** Screen-reader label of the close button. Default "Close". */
  closeLabel?: string;
  /** Pinned under the scrolling body (a primary action). */
  footer?: ReactNode;
  children: ReactNode;
  testID?: string;
}

/** The one sheet: a panel from the bottom with a grabber, a title, a close button and a scrolling body. */
export function Sheet({
  visible,
  onClose,
  title,
  detent = 'medium',
  closeLabel = 'Close',
  footer,
  children,
  testID = 'sheet',
}: SheetProps) {
  const styles = useStyles();
  const insets = useInsets();
  const { height } = useWindowDimensions();
  const share = DETENT_SHARE[detent];
  const size = detent === 'fit' ? { maxHeight: height * share } : { height: height * share };
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityElementsHidden
          importantForAccessibility="no"
          testID={`${testID}-backdrop`}
        />
        <View
          style={[styles.panel, size, { paddingBottom: insets.bottom }]}
          accessibilityViewIsModal
          testID={testID}
        >
          <View style={styles.grabber} />
          <View style={styles.header}>
            <Text variant="headline" accessibilityRole="header" style={styles.title}>
              {title ?? ''}
            </Text>
            <Button
              kind="text"
              icon="close"
              accessibilityLabel={closeLabel}
              onPress={onClose}
              testID={`${testID}-close`}
            />
          </View>
          <ScrollView
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
            style={detent === 'fit' ? undefined : { flex: 1 }}
          >
            {children}
          </ScrollView>
          {footer ? <View style={styles.body}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
      {/* iOS cannot present the app's alert over this modal; its own host takes over while open. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none" testID={`${testID}-host`}>
        <OverlayHost />
      </View>
    </Modal>
  );
}
