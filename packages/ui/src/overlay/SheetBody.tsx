import type { ComponentRef, ReactNode, Ref } from 'react';
import { type ScrollView, StyleSheet, View } from 'react-native';
import { ScreenBackground } from '../primitives/ScreenBackground';
import { OverlayHost } from './OverlayHost';
import { SheetContent } from './SheetContent';
import type { SheetProps } from './sheetTypes';

interface Props {
  sheet: SheetProps;
  /** As tall as its content. */
  fit: boolean;
  /** Drawn over the background, above the content (the JS host's grabber). */
  top?: ReactNode;
  scrollRef?: Ref<ComponentRef<typeof ScrollView>>;
  /** Who draws the footer and keeps it above the keyboard (see `SheetContent`). */
  footerPlacement?: 'inline' | 'host';
}

/** What every sheet host draws inside its panel: the canvas, the bar, title, body and footer. */
export function SheetBody({ sheet, fit, top, scrollRef, footerPlacement }: Props) {
  const testID = sheet.testID ?? 'sheet';
  return (
    <>
      <ScreenBackground testID={`${testID}-background`} />
      {top}
      <SheetContent
        onClose={sheet.onClose}
        title={sheet.title}
        closeLabel={sheet.closeLabel ?? 'Close'}
        leading={sheet.leading}
        trailing={sheet.trailing}
        largeTitle={sheet.largeTitle ?? false}
        closeButton={sheet.closeButton ?? true}
        headerless={sheet.headerless ?? false}
        footer={sheet.footer}
        footerPlacement={footerPlacement}
        fit={fit}
        scrollRef={scrollRef}
        testID={testID}
      >
        {sheet.children}
      </SheetContent>
    </>
  );
}

/** A sheet covers the app's own alert host: this one takes over while the sheet is open. */
export function SheetAlertHost({ testID = 'sheet' }: { testID?: string }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none" testID={`${testID}-host`}>
      <OverlayHost />
    </View>
  );
}
