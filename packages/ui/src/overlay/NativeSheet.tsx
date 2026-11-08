import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { type ScrollView, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/theme';
import { loadTrueSheet, type TrueSheetDetent, type TrueSheetMethods } from './loadTrueSheet';
import { SheetAlertHost, SheetBody } from './SheetBody';
import type { SheetDetent } from './sheetDetents';
import type { SheetProps } from './sheetTypes';

/** `fit` is the content's height (the native `auto`, capped at the screen); the rest are fractions. */
export function nativeDetents(detent: SheetDetent, maxShare: number): TrueSheetDetent[] {
  if (detent === 'fit') return ['auto'];
  if (detent === 'medium') return [0.5];
  if (detent === 'large') return [maxShare];
  return [Math.min(maxShare, Math.max(0.2, detent.fraction))];
}

/**
 * The native host of `Sheet`: a native sheet with the app's canvas surface and the sheet radius
 * token, so it matches the route sheets. `visible` presents and dismisses it; a swipe or scrim tap
 * reports `onClose`.
 */
export function NativeSheet(props: SheetProps) {
  const { visible, onClose, onDismissed, detent = 'fit', grabber = true, testID = 'sheet' } = props;
  const TrueSheet = loadTrueSheet();
  const { colors, metrics } = useTheme();
  const ref = useRef<TrueSheetMethods>(null);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  // The sheet's own dismissal (a swipe) arrives after the fact: do not dismiss it twice.
  const open = useRef(false);
  const [presented, setPresented] = useState(visible);
  useEffect(() => {
    if (visible) {
      setPresented(true);
      void ref.current?.present();
      open.current = true;
    } else if (open.current) {
      open.current = false;
      void ref.current?.dismiss();
    }
  }, [visible]);
  if (!TrueSheet) return null;
  const fill = detent === 'fit' ? undefined : styles.fill;
  return (
    <TrueSheet
      ref={ref}
      // Its content view is auto-height unless told: the flex surface below would collapse to nothing.
      style={fill}
      detents={nativeDetents(detent, metrics.sheetMaxShare)}
      backgroundColor={colors.canvas}
      cornerRadius={metrics.sheetRadius}
      grabber={grabber}
      scrollableRef={scrollRef}
      onDidDismiss={() => {
        if (open.current) {
          open.current = false;
          onClose();
        }
        setPresented(false);
        onDismissed?.();
      }}
      testID={testID}
    >
      {presented || visible ? (
        <View style={fill} testID={`${testID}-surface`}>
          <SheetBody sheet={props} fit={detent === 'fit'} scrollRef={scrollRef} />
          <SheetAlertHost testID={testID} />
        </View>
      ) : null}
    </TrueSheet>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
