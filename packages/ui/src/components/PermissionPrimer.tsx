import { View } from 'react-native';
import { Sheet } from '../overlay/Sheet';
import { Button } from '../primitives/Button';
import { Icon, type IconName } from '../primitives/Icon';
import { Text } from '../primitives/Text';
import { rounded } from '../theme/corners';
import { makeStyles, useTheme } from '../theme/theme';

const useStyles = makeStyles((t) => ({
  body: { gap: t.spacing.lg, paddingBottom: t.spacing.sm },
  title: { textAlign: 'center', paddingTop: t.spacing.md },
  reasons: { gap: t.spacing.md },
  reason: { flexDirection: 'row', alignItems: 'flex-start', gap: t.spacing.sm },
  bubble: {
    width: t.metrics.minTapSize,
    height: t.metrics.minTapSize,
    alignItems: 'center',
    justifyContent: 'center',
    ...rounded(t.radius.control),
  },
  reasonText: { flex: 1, gap: t.spacing.xxs },
  footer: { gap: t.spacing.xs },
  finePrint: { textAlign: 'center' },
}));

/** One reason to say yes: a glyph, a short bold line and one sentence. */
export interface PrimerReason {
  icon: IconName;
  title: string;
  message: string;
}

export interface PrimerAction {
  label: string;
  onPress: () => void;
}

export interface PermissionPrimerProps {
  visible: boolean;
  /** A swipe or backdrop tap; callers usually treat it as the secondary action. */
  onClose: () => void;
  onDismissed?: () => void;
  title: string;
  reasons: readonly PrimerReason[];
  /** Leads to the system prompt. */
  primary: PrimerAction;
  secondary: PrimerAction;
  /** Under the actions: where to change the answer later. */
  finePrint?: string;
  testID?: string;
}

function Reason({ reason }: { reason: PrimerReason }) {
  const styles = useStyles();
  const theme = useTheme();
  const ink = theme.tone('accent');
  return (
    <View style={styles.reason} accessible>
      <View style={[styles.bubble, { backgroundColor: theme.wash(ink) }]}>
        <Icon name={reason.icon} tint={ink} size={22} />
      </View>
      <View style={styles.reasonText}>
        <Text variant="headline">{reason.title}</Text>
        <Text variant="callout" tone="secondary">
          {reason.message}
        </Text>
      </View>
    </View>
  );
}

/**
 * The step before a system permission prompt: why the app asks, in a few reasons, then the choice.
 * The primary action is what shows the prompt; the secondary one leaves the permission untouched.
 * Notifications use it first; camera or microphone primers pass their own reasons.
 */
export function PermissionPrimer(props: PermissionPrimerProps) {
  const { primary, secondary, finePrint, testID = 'permission-primer' } = props;
  const styles = useStyles();
  return (
    <Sheet
      visible={props.visible}
      onClose={props.onClose}
      onDismissed={props.onDismissed}
      detent="fit"
      headerless
      testID={testID}
      footer={
        <View style={styles.footer}>
          <Button title={primary.label} onPress={primary.onPress} testID={`${testID}-primary`} />
          <Button
            kind="text"
            title={secondary.label}
            onPress={secondary.onPress}
            testID={`${testID}-secondary`}
          />
          {finePrint ? (
            <Text variant="footnote" tone="secondary" style={styles.finePrint}>
              {finePrint}
            </Text>
          ) : null}
        </View>
      }
    >
      <View style={styles.body}>
        <Text variant="title2" accessibilityRole="header" style={styles.title}>
          {props.title}
        </Text>
        <View style={styles.reasons}>
          {props.reasons.map((reason) => (
            <Reason key={reason.title} reason={reason} />
          ))}
        </View>
      </View>
    </Sheet>
  );
}
