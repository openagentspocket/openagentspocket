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
import { BarAction } from '../components/SheetBar';
import { Button } from '../primitives/Button';
import { GlassCapsule } from '../primitives/GlassCapsule';
import { ScreenBackground } from '../primitives/ScreenBackground';
import { SurfaceFillProvider } from '../primitives/surfaceFill';
import { Text } from '../primitives/Text';
import { useInsets } from '../theme/insets';
import { makeStyles, useTheme } from '../theme/theme';
import { OverlayHost } from './OverlayHost';
import { detentShare, type SheetDetent, useSheetDrag } from './sheetDetents';

export type { SheetDetent };

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
  panel: {
    backgroundColor: t.colors.surfaceOverlay,
    overflow: 'hidden',
    borderTopLeftRadius: t.metrics.sheetRadius,
    borderTopRightRadius: t.metrics.sheetRadius,
    borderWidth: t.metrics.hairlineWidth,
    borderBottomWidth: 0,
    borderColor: t.hairline,
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xs,
    paddingLeft: t.metrics.screenInset,
    paddingRight: t.spacing.xs,
    minHeight: t.metrics.minTapSize,
  },
  // A bar's capsules sit on the content gutter, not hugging the edge.
  barHeader: { paddingRight: t.metrics.screenInset },
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
  testID?: string;
}

interface SheetProps {
  visible: boolean;
  /** Called on the close button, a backdrop tap and the Android back button. */
  onClose: () => void;
  /** After the close animation ended (iOS): where a sheet hands over to a route, which cannot present while it is still leaving. */
  onDismissed?: () => void;
  title?: string;
  /**
   * Where the sheet opens. Default `fit`: as tall as its content (at least `sheetMinShare` of the
   * window, at most `sheetMaxShare`), scrolling only past that. `medium`/`large`/`{ fraction }` fix a height.
   */
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
  /** No bar and no title row: the content draws its own header (a day sheet). */
  headerless?: boolean;
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
  onDismissed,
  title,
  detent = 'fit',
  leading,
  trailing,
  largeTitle = false,
  headerless = false,
  grabber = true,
  closeButton = true,
  closeLabel = 'Close',
  footer,
  children,
  testID = 'sheet',
}: SheetProps) {
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
  const bar = leading !== undefined || trailing !== undefined;
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
      onDismiss={onDismissed}
    >
      <KeyboardAvoidingView
        // The status bar's height stays free and the panel never outgrows what is left, so a sheet
        // lifted by the keyboard stops under the status bar instead of passing through it.
        style={[styles.root, { paddingTop: insets.top }]}
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
          style={[styles.panel, styles.full, size, styles.fits, { paddingBottom: insets.bottom }]}
          accessibilityViewIsModal
          testID={testID}
        >
          <ScreenBackground testID={`${testID}-background`} />
          {grabber ? (
            <View style={styles.dragArea} {...drag.handlers} testID={`${testID}-grabber`}>
              <View style={styles.grabber} />
            </View>
          ) : null}
          {headerless ? null : bar ? (
            <>
              <View style={[styles.header, styles.barHeader]} testID={`${testID}-bar`}>
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
                    <GlassCapsule>
                      <BarAction action={trailing} testID={`${testID}-trailing`} />
                    </GlassCapsule>
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
            // The panel already lifts with the keyboard; this scrolls the focused field into view.
            automaticallyAdjustKeyboardInsets
            style={live === 'fit' ? { flexShrink: 1 } : { flex: 1 }}
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

function BarButton({ action, testID }: { action: SheetBarAction; testID: string }) {
  return (
    <Button
      kind="capsule"
      size="small"
      title={action.label}
      onPress={action.onPress}
      disabled={action.disabled}
      loading={action.loading}
      testID={action.testID ?? testID}
    />
  );
}
