import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../primitives/Text';
import { makeStyles } from '../theme/theme';

const useStyles = makeStyles((t) => ({
  specimen: { gap: t.spacing.xs },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: t.spacing.xs },
  stack: { gap: t.spacing.xs },
}));

/** One labeled specimen in the gallery: what it is, then the thing in its states. */
export function Specimen({ name, children }: { name: string; children: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.specimen} testID={`specimen-${name}`}>
      <Text variant="mono" tone="tertiary">
        {name}
      </Text>
      {children}
    </View>
  );
}

/** Lays specimens' states side by side, wrapping. */
export function Wrap({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <View style={styles.wrap}>{children}</View>;
}

/** Lays states one under the other. */
export function Stack({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <View style={styles.stack}>{children}</View>;
}
