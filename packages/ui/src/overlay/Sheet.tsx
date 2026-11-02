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
import { ScreenBackground } from '../primitives/ScreenBackground';
import { SurfaceFillProvider } from '../primitives/surfaceFill';
import { Text } from '../primitives/Text';
import { useInsets } from '../theme/insets';
import { makeStyles } from '../theme/theme';
import { OverlayHost } from './OverlayHost';
import { DETENT_SHARE, detentShare, type SheetDetent, useSheetDrag } from './sheetDetents';

export type { SheetDetent };

const useStyles = makeStyles((t) => ({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { flex: 1, backgroundColor: t.backdrop },
  panel: {
    backgroundColor: t.colors.surfaceOverlay,
    overflow: 'hidden',
    borderTopLeftRadius: t.metrics.sheetRadius,
    borderTopRightRadius: t.metrics.sheetRadius,
    borderWidth: t.metrics.hairlineWidth,
    borderBottomWidth: 0,
    borderColor: t.hairline,
    width: '100%',
    maxWidth: t.metrics.readableWidth,
    alignSelf: 'center',
  },
  dragArea: { alignItems: 'center', paddingBottom: t.spacing.xs },
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
  barTitle: { flex: 1, textAlign: 'center' },
  barSlot: { minWidth: t.metrics.minTapSize * 1.5, flexDirection: 'row' },
  barEnd: { justifyContent: 'flex-end' },
  largeHeader: { paddingHorizontal: t.metrics.screenInset, gap: t.spacing.xs },
  largeTitle: { paddingBottom: t.spacing.xs },
  body: { paddingHorizontal: t.metrics.screenInset, paddingTop: t.spacing.xs, gap: t.spacing.md },
}));

/** A labeled action in the sheet's bar: `Cancel` / `Done` leading, `Start` / `Save` trailing. */
export interface SheetBarAction {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}

interface SheetProps {
  visible: boolean;
  /** Called on the close button, a backdrop tap and the Android back button. */
  onClose: () => void;
  title?: string;
  detent?: SheetDetent;
  /** Screen-reader label of the close button. Default "Close". */
  closeLabel?: string;
  /** Leading bar action (Cancel, Done). Replaces the trailing close button. */
  leading?: SheetBarAction;
  /** Trailing bar action (Start, Save): the confirm of a form sheet. */
  trailing?: SheetBarAction;
  /** Title drawn large under the bar (Settings, Hosts) instead of inline. */
  largeTitle?: boolean;
  /** False on an untitled sheet that dismisses by swipe or backdrop (the quick detail): no header row. */
  closeButton?: boolean;
  /** Hide the grabber (large form sheets). Default shown. */
  grabber?: boolean;
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
  leading,
  trailing,
  largeTitle = false,
  grabber = true,
  closeButton = true,
  closeLabel = 'Close',
  footer,
  children,
  testID = 'sheet',
}: SheetProps) {
  const styles = useStyles();
  const insets = useInsets();
  const { height } = useWindowDimensions();
  const drag = useSheetDrag(detent, onClose, visible);
  const live = drag.detent;
  const share = detentShare(live);
  const limit = height * DETENT_SHARE.large;
  const grown = Math.min(limit, Math.max(height * 0.2, height * share + drag.offset));
  const size = live === 'fit' ? { maxHeight: height * share } : { height: grown };
  const bar = leading !== undefined || trailing !== undefined;
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
          <ScreenBackground testID={`${testID}-background`} />
          {grabber ? (
            <View style={styles.dragArea} {...drag.handlers} testID={`${testID}-grabber`}>
              <View style={styles.grabber} />
            </View>
          ) : null}
          {bar ? (
            <>
              <View style={styles.header} testID={`${testID}-bar`}>
                <View style={styles.barSlot}>
                  {leading ? <BarButton action={leading} testID={`${testID}-leading`} /> : null}
                </View>
                {largeTitle ? (
                  <View style={styles.title} />
                ) : (
                  <Text
                    variant="headline"
                    accessibilityRole="header"
                    style={styles.barTitle}
                    numberOfLines={1}
                  >
                    {title ?? ''}
                  </Text>
                )}
                <View style={[styles.barSlot, styles.barEnd]}>
                  {trailing ? (
                    <BarButton action={trailing} emphasized testID={`${testID}-trailing`} />
                  ) : null}
                </View>
              </View>
              {largeTitle ? (
                <View style={styles.largeHeader}>
                  <Text
                    variant="title"
                    accessibilityRole="header"
                    style={styles.largeTitle}
                    numberOfLines={2}
                  >
                    {title ?? ''}
                  </Text>
                </View>
              ) : null}
            </>
          ) : closeButton || title !== undefined ? (
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
          ) : null}
          <ScrollView
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
            style={live === 'fit' ? undefined : { flex: 1 }}
          >
            <SurfaceFillProvider value="surfaceOverlay">{children}</SurfaceFillProvider>
          </ScrollView>
          {footer ? (
            <View style={styles.body}>
              <SurfaceFillProvider value="surfaceOverlay">{footer}</SurfaceFillProvider>
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
      {/* iOS cannot present the app's alert over this modal; its own host takes over while open. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none" testID={`${testID}-host`}>
        <OverlayHost />
      </View>
    </Modal>
  );
}

function BarButton({
  action,
  emphasized = false,
  testID,
}: {
  action: SheetBarAction;
  emphasized?: boolean;
  testID: string;
}) {
  return (
    <Button
      kind={emphasized ? 'primary' : 'capsule'}
      size="small"
      title={action.label}
      onPress={action.onPress}
      disabled={action.disabled}
      loading={action.loading}
      testID={testID}
    />
  );
}
