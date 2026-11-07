import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native';
import { type Edge, SafeAreaView } from 'react-native-safe-area-context';
import { useInsets } from '../theme/insets';
import { makeStyles, useTheme } from '../theme/theme';
import { ScreenBackground } from './ScreenBackground';
import {
  type ScreenHeader,
  ScreenHeaderBar,
  useKeyboardOffset,
  useOffscreenBottom,
} from './screenParts';

export type { ScreenHeader };

import { ThemedRefreshControl } from './ThemedRefreshControl';

const ALL_EDGES: readonly Edge[] = ['top', 'right', 'bottom', 'left'];
const UNDER_NATIVE_HEADER: readonly Edge[] = ['right', 'bottom', 'left'];

const useStyles = makeStyles((t) => ({
  root: { flex: 1, backgroundColor: t.colors.canvas },
  fill: { flex: 1 },
  content: { padding: t.metrics.screenInset, gap: t.spacing.lg },
  readable: { width: '100%', maxWidth: t.metrics.readableWidth, alignSelf: 'center' },
}));

interface ScreenProps {
  children: ReactNode;
  /** Scrolls by default; false for a screen that lays out its own list. */
  scroll?: boolean;
  /** Pull to refresh (scrolling screens only). */
  refreshing?: boolean;
  onRefresh?: () => void;
  /** The header; omitted for a full-bleed screen that draws its own chrome (terminal, agent detail). */
  header?: ScreenHeader;
  /**
   * Overrides the safe-area edges, which the header decides: all four, except under a native header
   * (no top). Only for a screen that is laid out under something the header cannot describe.
   */
  edges?: readonly Edge[];
  /**
   * Keeps the focused field above the software keyboard (on by default, in sheets too: the screen's
   * own frame is measured, so a form sheet at a partial detent is handled). A scrolling screen on iOS
   * lets the ScrollView inset itself and scroll the field into view; the others, and Android (which
   * draws edge to edge, so the window no longer resizes), lift the content with a
   * KeyboardAvoidingView. False only for a screen that has no fields.
   */
  keyboardAvoiding?: boolean;
  /**
   * Space reserved at the top for a transparent native header (its height, from the navigator): the
   * screen's background runs under the bar and the content starts below it.
   */
  headerInset?: number;
  /** Full width, no inset or readable column: the screen lays out its own columns (non-scrolling). */
  bare?: boolean;
  testID?: string;
}

/** Themed page background, safe area, and a readable column with the screen inset. */
export function Screen({
  children,
  scroll = true,
  refreshing = false,
  onRefresh,
  edges,
  keyboardAvoiding = true,
  header,
  headerInset = 0,
  bare = false,
  testID = 'screen',
}: ScreenProps) {
  const styles = useStyles();
  const { hidden, ref, onLayout } = useOffscreenBottom();
  const theme = useTheme();
  const insets = useInsets();
  const safeEdges = edges ?? (header?.variant === 'native' ? UNDER_NATIVE_HEADER : ALL_EDGES);
  const lift = useKeyboardOffset(safeEdges.includes('bottom') ? insets.bottom : 0);
  const nativeInsets = Platform.OS === 'ios' && scroll && !bare;
  const refresh = onRefresh ? (
    <ThemedRefreshControl refreshing={refreshing} onRefresh={onRefresh} />
  ) : undefined;
  return (
    <SafeAreaView
      ref={ref}
      onLayout={onLayout}
      style={styles.root}
      edges={safeEdges}
      testID={testID}
    >
      <ScreenBackground />
      <View style={[styles.fill, { paddingTop: headerInset, paddingBottom: hidden }]}>
        <ScreenHeaderBar header={header} />
        <KeyboardAvoidingView
          style={styles.fill}
          enabled={keyboardAvoiding && !nativeInsets}
          // Only the full-bleed screens: a sheet does not start at the top of the window.
          keyboardVerticalOffset={bare ? lift.offset : 0}
          onLayout={lift.onLayout}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          testID={`${testID}-keyboard`}
        >
          {bare ? (
            <View style={styles.fill}>{children}</View>
          ) : scroll ? (
            <ScrollView
              style={styles.fill}
              testID={`${testID}-scroll`}
              contentContainerStyle={[styles.content, styles.readable]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              automaticallyAdjustKeyboardInsets={keyboardAvoiding}
              refreshControl={refresh}
            >
              {children}
            </ScrollView>
          ) : (
            <View style={[styles.fill, styles.content, styles.readable]}>{children}</View>
          )}
        </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  );
}
