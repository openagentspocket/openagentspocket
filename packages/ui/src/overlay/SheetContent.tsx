import type { ComponentRef, ReactNode, Ref } from 'react';
import { ScrollView, View } from 'react-native';
import { BarAction } from '../components/SheetBar';
import { Button } from '../primitives/Button';
import { GlassCapsule } from '../primitives/GlassCapsule';
import { SurfaceFillProvider } from '../primitives/surfaceFill';
import { Text } from '../primitives/Text';
import { makeStyles } from '../theme/theme';

const useStyles = makeStyles((t) => ({
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
  // Floats over the content on the native host: the canvas under it hides what scrolls behind.
  hostFooter: { backgroundColor: t.colors.canvas, paddingBottom: t.spacing.sm },
}));

/** A labeled action in the sheet's bar: `Cancel` / `Done` leading, `Start` / `Save` trailing. */
export interface SheetBarAction {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
}

/** What a sheet draws inside its surface, whichever host (native or JS) presents it. */
export interface SheetContentProps {
  onClose: () => void;
  title?: string;
  closeLabel: string;
  leading?: SheetBarAction;
  trailing?: SheetBarAction;
  largeTitle: boolean;
  closeButton: boolean;
  headerless: boolean;
  footer?: ReactNode;
  /**
   * `inline`: the footer is drawn here under the body and the ScrollView keeps the focused field
   * above the keyboard (the JS host lifts the whole panel). `host`: the host draws the footer
   * (`SheetFooter`) above the keyboard and insets the plugged scroll view itself (True Sheet).
   */
  footerPlacement?: 'inline' | 'host';
  /** Content-sized: the body shrinks and scrolls past the host's limit; otherwise it fills. */
  fit: boolean;
  scrollRef?: Ref<ComponentRef<typeof ScrollView>>;
  children: ReactNode;
  testID: string;
}

/** The bar or title row, the scrolling body and the pinned footer: one look for every host. */
export function SheetContent({
  onClose,
  title,
  closeLabel,
  leading,
  trailing,
  largeTitle,
  closeButton,
  headerless,
  footer,
  footerPlacement = 'inline',
  fit,
  scrollRef,
  children,
  testID,
}: SheetContentProps) {
  const styles = useStyles();
  const bar = leading !== undefined || trailing !== undefined;
  return (
    <>
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
        ref={scrollRef}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        // Inline, the JS panel lifts with the keyboard and this scrolls the focused field into
        // view; on the native host True Sheet insets the plugged scroll view: once, not twice.
        automaticallyAdjustKeyboardInsets={footerPlacement === 'inline'}
        style={fit ? { flexShrink: 1 } : { flex: 1 }}
        testID={`${testID}-scroll`}
      >
        <SurfaceFillProvider value="surfaceOverlay">{children}</SurfaceFillProvider>
      </ScrollView>
      {footer && footerPlacement === 'inline' ? <SheetFooter footer={footer} /> : null}
    </>
  );
}

/** The pinned footer (a primary action): under the body inline, or given to the native host. */
export function SheetFooter({ footer, host = false }: { footer: ReactNode; host?: boolean }) {
  const styles = useStyles();
  return (
    <View style={host ? [styles.body, styles.hostFooter] : styles.body}>
      <SurfaceFillProvider value="surfaceOverlay">{footer}</SurfaceFillProvider>
    </View>
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
