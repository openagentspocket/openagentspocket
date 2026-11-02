import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../primitives/Button';
import { Text } from '../primitives/Text';
import { makeStyles } from '../theme/theme';

const useStyles = makeStyles((t) => ({
  root: { gap: t.spacing.xs, paddingBottom: t.spacing.xs },
  grabberRow: { alignItems: 'center', paddingTop: 8 },
  grabber: { width: 36, height: 5, borderRadius: 3, backgroundColor: t.colors.control },
  row: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs },
  fill: { flex: 1 },
  close: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.control,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.xs },
}));

interface QuickSheetHeaderProps {
  title: string;
  onClose: () => void;
  /** Detail layout: a leading line (program, state) above the large title. */
  eyebrow?: ReactNode;
  /** Right end of the eyebrow line (the age). */
  eyebrowTrailing?: string;
  /** Detail layout: chips under the title. */
  chips?: ReactNode;
  closeLabel?: string;
  /** False when an enclosing Sheet already draws the grabber. */
  grabber?: boolean;
  testID?: string;
}

/** The header of a quick sheet: grabber, title with a 32pt close circle, or the detail layout with eyebrow and chips. */
export function QuickSheetHeader({
  title,
  onClose,
  eyebrow,
  eyebrowTrailing,
  chips,
  closeLabel = 'Close',
  grabber = true,
  testID = 'quick-sheet-header',
}: QuickSheetHeaderProps) {
  const styles = useStyles();
  const detail = eyebrow !== undefined || chips !== undefined;
  return (
    <View style={styles.root} testID={testID}>
      {grabber ? (
        <View style={styles.grabberRow}>
          <View style={styles.grabber} testID={`${testID}-grabber`} />
        </View>
      ) : null}
      {detail ? (
        <>
          <View style={styles.row}>
            <View style={[styles.row, styles.fill]}>{eyebrow}</View>
            {eyebrowTrailing ? (
              <Text variant="callout" tone="secondary">
                {eyebrowTrailing}
              </Text>
            ) : null}
          </View>
          <Text variant="title2" accessibilityRole="header" numberOfLines={2}>
            {title}
          </Text>
          {chips ? <View style={styles.chips}>{chips}</View> : null}
        </>
      ) : (
        <View style={styles.row}>
          <Text variant="title2" accessibilityRole="header" style={styles.fill} numberOfLines={1}>
            {title}
          </Text>
          <View style={styles.close}>
            <Button
              kind="text"
              size="small"
              icon="close"
              accessibilityLabel={closeLabel}
              onPress={onClose}
              testID={`${testID}-close`}
            />
          </View>
        </View>
      )}
    </View>
  );
}
