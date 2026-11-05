import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { type Edge, SafeAreaView } from 'react-native-safe-area-context';
import { LargeTitleBar, type TitleBarAction } from '../components/LargeTitleBar';
import { SheetBar, type SheetBarItem } from '../components/SheetBar';
import { makeStyles, useTheme } from '../theme/theme';
import { ScreenBackground } from './ScreenBackground';
import { ThemedRefreshControl } from './ThemedRefreshControl';

const ALL_EDGES: readonly Edge[] = ['top', 'right', 'bottom', 'left'];
const UNDER_NATIVE_HEADER: readonly Edge[] = ['right', 'bottom', 'left'];

const useStyles = makeStyles((t) => ({
  root: { flex: 1, backgroundColor: t.colors.canvas },
  fill: { flex: 1 },
  content: { padding: t.metrics.screenInset, gap: t.spacing.lg },
  readable: { width: '100%', maxWidth: t.metrics.readableWidth, alignSelf: 'center' },
}));

/**
 * The three headers a screen can have. `native` draws nothing here (the navigator's header sits above
 * the screen, which then drops its own top inset); `large` is the title with a capsule of actions
 * (Home, Agents); `sheet` is the glass bar of a modal (Done, Cancel, back, an actions capsule), with an
 * optional large title under it.
 */
export type ScreenHeader =
  | {
      variant: 'native';
      /** The navigator's title; read by the app's `AppScreen`, not drawn here. */
      title?: string;
    }
  | { variant: 'large'; title: string; actions?: readonly TitleBarAction[] }
  | {
      variant: 'sheet';
      title: string;
      subtitle?: string;
      /** Large bold title under the bar instead of centered in it. */
      large?: boolean;
      leading?: SheetBarItem;
      back?: boolean;
      trailing?: readonly SheetBarItem[];
      testID?: string;
    };

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
   * Lifts the content above the software keyboard. Android draws edge to edge, so the window no
   * longer resizes and the keyboard would cover the lower fields (a tap on them hit the keys and the
   * text went to the previously focused field).
   */
  keyboardAvoiding?: boolean;
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
  keyboardAvoiding = false,
  header,
  bare = false,
  testID = 'screen',
}: ScreenProps) {
  const styles = useStyles();
  const theme = useTheme();
  const refresh = onRefresh ? (
    <ThemedRefreshControl refreshing={refreshing} onRefresh={onRefresh} />
  ) : undefined;
  return (
    <SafeAreaView
      style={styles.root}
      edges={edges ?? (header?.variant === 'native' ? UNDER_NATIVE_HEADER : ALL_EDGES)}
      testID={testID}
    >
      <ScreenBackground />
      <ScreenHeaderBar header={header} />
      <KeyboardAvoidingView
        style={styles.fill}
        enabled={keyboardAvoiding}
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
            refreshControl={refresh}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.fill, styles.content, styles.readable]}>{children}</View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Draws the header of a `large` or `sheet` screen; a native header is the navigator's. */
function ScreenHeaderBar({ header }: { header: ScreenHeader | undefined }) {
  if (header?.variant === 'large') {
    return <LargeTitleBar title={header.title} actions={header.actions ?? []} />;
  }
  if (header?.variant === 'sheet') {
    const { variant: _variant, ...bar } = header;
    return <SheetBar {...bar} />;
  }
  return null;
}
