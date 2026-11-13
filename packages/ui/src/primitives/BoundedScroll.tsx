import { type ReactNode, useEffect, useRef } from 'react';
import { ScrollView, type ScrollViewInstance, useWindowDimensions } from 'react-native';
import { makeStyles } from '../theme/theme';

/** Of the window's height: what is left stays for the controls under the text. */
const WINDOW_SHARE = 0.25;

const useStyles = makeStyles((t) => ({ content: { gap: t.spacing.sm } }));

interface BoundedScrollProps {
  children: ReactNode;
  testID?: string;
  /** Of the window's height the content may take; the default leaves room under it. */
  share?: number;
  /** The content starts again at its top whenever this changes (a new filter query). */
  resetKey?: string;
  /** Children are spaced apart (default); rows that draw their own dividers turn it off. */
  spaced?: boolean;
}

/** Content of any length that never pushes what follows it off screen: past its limit, it scrolls. */
export function BoundedScroll({
  children,
  testID = 'bounded-scroll',
  share = WINDOW_SHARE,
  resetKey,
  spaced = true,
}: BoundedScrollProps) {
  const styles = useStyles();
  const { height } = useWindowDimensions();
  const scroll = useRef<ScrollViewInstance>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `resetKey` is the trigger, not a value read.
  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [resetKey]);
  return (
    <ScrollView
      ref={scroll}
      style={{ maxHeight: height * share, flexGrow: 0 }}
      contentContainerStyle={spaced ? styles.content : undefined}
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled
      testID={testID}
    >
      {children}
    </ScrollView>
  );
}
