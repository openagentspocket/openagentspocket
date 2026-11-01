import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { makeStyles } from '../theme/theme';

const useStyles = makeStyles((t) => ({
  root: { flex: 1, backgroundColor: t.colors.canvas },
  content: { padding: t.metrics.screenInset, gap: t.spacing.lg },
}));

interface ScreenProps {
  scroll?: boolean;
  children: ReactNode;
}

/** Themed page background with the screen inset; scrolls by default. */
export function Screen({ scroll = true, children }: ScreenProps) {
  const styles = useStyles();
  return (
    <SafeAreaView style={styles.root} testID="screen">
      {scroll ? (
        <ScrollView contentContainerStyle={styles.content}>{children}</ScrollView>
      ) : (
        <View style={[styles.root, styles.content]}>{children}</View>
      )}
    </SafeAreaView>
  );
}
