import { View } from 'react-native';
import { Sheet } from '../overlay/Sheet';
import { Button } from '../primitives/Button';
import { Icon, type IconName } from '../primitives/Icon';
import { Text } from '../primitives/Text';
import { makeStyles } from '../theme/theme';

const useStyles = makeStyles((t) => ({
  body: { gap: t.spacing.sm },
  state: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs },
  footer: { gap: t.spacing.xs },
}));

interface ConnectionSheetProps {
  visible: boolean;
  title: string;
  /** "Reconnecting" with its glyph, and a trailing "Attempt 1". */
  state: { icon: IconName; label: string; note?: string };
  /** A mono line under the state (the routes tried). */
  detail?: string;
  /** Why the last attempt failed: a headline and mono lines. */
  failure?: { title: string; detail: string };
  primary: { label: string; onPress: () => void };
  secondary?: { label: string; onPress: () => void };
  /** The bar's trailing action ("Edit"). */
  edit?: { label: string; onPress: () => void };
  onClose: () => void;
  testID?: string;
}

/** A sheet that explains a connection and offers a retry: state, routes, failure, a primary and a text action. */
export function ConnectionSheet(props: ConnectionSheetProps) {
  const styles = useStyles();
  const { state, failure, edit, secondary, testID = 'connection-sheet' } = props;
  return (
    <Sheet
      visible={props.visible}
      onClose={props.onClose}
      title={props.title}
      detent="medium"
      trailing={edit ? { ...edit, testID: `${testID}-edit` } : undefined}
      footer={
        <View style={styles.footer}>
          <Button
            title={props.primary.label}
            onPress={props.primary.onPress}
            testID={`${testID}-primary`}
          />
          {secondary ? (
            <Button
              kind="text"
              title={secondary.label}
              onPress={secondary.onPress}
              testID={`${testID}-secondary`}
            />
          ) : null}
        </View>
      }
      testID={testID}
    >
      <View style={styles.body}>
        <View style={styles.state}>
          <Icon name={state.icon} color="textSecondary" />
          <Text semibold>{state.label}</Text>
          {state.note ? <Text tone="secondary">{state.note}</Text> : null}
        </View>
        {props.detail ? (
          <Text variant="footnote" monospaced tone="secondary">
            {props.detail}
          </Text>
        ) : null}
        {failure ? (
          <>
            <Text semibold>{failure.title}</Text>
            <Text variant="footnote" monospaced tone="secondary">
              {failure.detail}
            </Text>
          </>
        ) : null}
      </View>
    </Sheet>
  );
}
