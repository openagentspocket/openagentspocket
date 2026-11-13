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
  panel: { gap: t.spacing.md, padding: t.metrics.screenInset },
}));

export interface ConnectionAction {
  label: string;
  onPress: () => void;
}

/** What a connection says and offers, wherever it is shown (a sheet or a screen's panel). */
export interface ConnectionStatus {
  title: string;
  /** "Reconnecting" with its glyph, and a trailing "Attempt 1". */
  state: { icon: IconName; label: string; note?: string };
  /** A mono line under the state (the routes tried). */
  detail?: string;
  /** Why the last attempt failed: a headline and mono lines. */
  failure?: { title: string; detail: string };
  primary: ConnectionAction;
  secondary?: ConnectionAction;
  /** The sheet bar's trailing action ("Edit"); a text action in a panel. */
  edit?: ConnectionAction;
  /** Further text actions under the secondary one ("Pair Again"), each keyed for its testID. */
  more?: readonly (ConnectionAction & { key: string })[];
}

interface ConnectionSheetProps extends ConnectionStatus {
  visible: boolean;
  onClose: () => void;
  onDismissed?: () => void;
  testID?: string;
}

function ConnectionBody({ state, detail, failure }: ConnectionStatus) {
  const styles = useStyles();
  return (
    <View style={styles.body}>
      <View style={styles.state}>
        <Icon name={state.icon} color="textSecondary" />
        <Text semibold>{state.label}</Text>
        {state.note ? <Text tone="secondary">{state.note}</Text> : null}
      </View>
      {detail ? (
        <Text variant="footnote" monospaced tone="secondary">
          {detail}
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
  );
}

function ConnectionActions(props: ConnectionStatus & { testID: string; withEdit: boolean }) {
  const styles = useStyles();
  const { primary, secondary, edit, more = [], testID } = props;
  const texts = [
    ...(secondary ? [{ ...secondary, key: 'secondary' }] : []),
    ...more,
    ...(props.withEdit && edit ? [{ ...edit, key: 'edit' }] : []),
  ];
  return (
    <View style={styles.footer}>
      <Button title={primary.label} onPress={primary.onPress} testID={`${testID}-primary`} />
      {texts.map((action) => (
        <Button
          key={action.key}
          kind="text"
          title={action.label}
          onPress={action.onPress}
          testID={`${testID}-${action.key}`}
        />
      ))}
    </View>
  );
}

/** A sheet that explains a connection and offers a retry: state, routes, failure, a primary and text actions. */
export function ConnectionSheet(props: ConnectionSheetProps) {
  const { edit, testID = 'connection-sheet' } = props;
  return (
    <Sheet
      visible={props.visible}
      onClose={props.onClose}
      onDismissed={props.onDismissed}
      title={props.title}
      detent="fit"
      trailing={edit ? { ...edit, testID: `${testID}-edit` } : undefined}
      footer={<ConnectionActions {...props} testID={testID} withEdit={false} />}
      testID={testID}
    >
      <ConnectionBody {...props} />
    </Sheet>
  );
}

/** The same connection in a screen's body (no sheet): title, state, failure and every action. */
export function ConnectionPanel(props: ConnectionStatus & { testID?: string }) {
  const styles = useStyles();
  const { testID = 'connection-panel' } = props;
  return (
    <View style={styles.panel} testID={testID}>
      <Text variant="title2" semibold accessibilityRole="header">
        {props.title}
      </Text>
      <ConnectionBody {...props} />
      <ConnectionActions {...props} testID={testID} withEdit />
    </View>
  );
}
