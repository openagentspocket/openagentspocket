import type { ReactNode } from 'react';
import { ScrollView, useWindowDimensions } from 'react-native';
import { makeStyles } from '../theme/theme';

/** Of the window's height: what is left stays for the controls under the text. */
const WINDOW_SHARE = 0.25;

const useStyles = makeStyles((t) => ({ content: { gap: t.spacing.sm } }));

interface BoundedScrollProps {
  children: ReactNode;
  testID?: string;
}

/** Content of any length that never pushes what follows it off screen: past its limit, it scrolls. */
export function BoundedScroll({ children, testID = 'bounded-scroll' }: BoundedScrollProps) {
  const styles = useStyles();
  const { height } = useWindowDimensions();
  return (
    <ScrollView
      style={{ maxHeight: height * WINDOW_SHARE, flexGrow: 0 }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled
      testID={testID}
    >
      {children}
    </ScrollView>
  );
}
