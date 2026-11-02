import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { type Edge, SafeAreaView } from 'react-native-safe-area-context';
import { makeStyles, useTheme } from '../theme/theme';
import { ScreenBackground } from './ScreenBackground';

const ALL_EDGES: readonly Edge[] = ['top', 'right', 'bottom', 'left'];

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
  /** Safe-area edges to inset; a screen under a navigation header drops 'top'. */
  edges?: readonly Edge[];
  testID?: string;
}

/** Themed page background, safe area, and a readable column with the screen inset. */
export function Screen({
  children,
  scroll = true,
  refreshing = false,
  onRefresh,
  edges = ALL_EDGES,
  testID = 'screen',
}: ScreenProps) {
  const styles = useStyles();
  const theme = useTheme();
  const refresh = onRefresh ? (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={theme.colors.accent}
      colors={[theme.colors.accent]}
      progressBackgroundColor={theme.colors.surfaceRaised}
    />
  ) : undefined;
  return (
    <SafeAreaView style={styles.root} edges={edges} testID={testID}>
      <ScreenBackground />
      {scroll ? (
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
    </SafeAreaView>
  );
}
