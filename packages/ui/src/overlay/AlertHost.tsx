import { useState } from 'react';
import { Modal, Pressable, TextInput, View } from 'react-native';
import { Button } from '../primitives/Button';
import { monoFamily, Text } from '../primitives/Text';
import { useInsets } from '../theme/insets';
import { spacing } from '../theme/metrics';
import { makeStyles, useTheme } from '../theme/theme';
import { type AlertRequest, alertQueue, answerAlert } from './confirm';
import { useActiveHost, useQueue } from './store';

const useStyles = makeStyles((t) => ({
  backdrop: { flex: 1, backgroundColor: t.backdrop },
  center: { justifyContent: 'center', alignItems: 'center', padding: t.metrics.screenInset },
  bottom: { justifyContent: 'flex-end', paddingHorizontal: t.spacing.xs },
  panel: {
    backgroundColor: t.colors.surfaceOverlay,
    borderRadius: t.metrics.cardRadius,
    borderWidth: t.metrics.hairlineWidth,
    borderColor: t.hairline,
    padding: t.spacing.md,
    gap: t.spacing.sm,
  },
  alert: { width: '100%', maxWidth: 340 },
  dialog: { width: '100%', maxWidth: t.metrics.readableWidth, alignSelf: 'center' },
  text: { gap: t.spacing.xxs },
  centered: { textAlign: 'center' },
  row: { flexDirection: 'row', gap: t.spacing.xs },
  grow: { flex: 1 },
  column: { gap: t.spacing.xs },
  input: {
    minHeight: t.metrics.minTapSize,
    paddingHorizontal: t.spacing.sm,
    borderRadius: t.metrics.chipRadius,
    borderWidth: t.metrics.hairlineWidth,
    borderColor: t.hairline,
    backgroundColor: t.colors.control,
    color: t.colors.textPrimary,
    fontSize: 15,
    fontFamily: monoFamily,
  },
}));

/** Draws the request at the head of the confirm() queue. Mounted once, by OverlayHost. */
export function AlertHost() {
  const active = useActiveHost('alert');
  const queue = useQueue(alertQueue);
  const current = active ? queue[0] : undefined;
  return (
    <Modal
      visible={current !== undefined}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => current && answerAlert(current, null)}
    >
      {current ? <AlertPanel request={current} /> : null}
    </Modal>
  );
}

function AlertPanel({ request }: { request: AlertRequest }) {
  const styles = useStyles();
  const insets = useInsets();
  const theme = useTheme();
  const [text, setText] = useState(request.field?.initial ?? '');
  const isAlert = request.presentation === 'alert';
  const cancel =
    request.cancelLabel === null ? null : (
      <View style={isAlert ? styles.grow : undefined}>
        <Button
          kind="secondary"
          title={request.cancelLabel}
          onPress={() => answerAlert(request, null)}
          testID="alert-cancel"
        />
      </View>
    );
  const actions = request.actions.map((action, index) => (
    <View key={action.key} style={isAlert ? styles.grow : undefined}>
      <Button
        kind={action.destructive ? 'destructive' : index === 0 && isAlert ? 'primary' : 'secondary'}
        title={action.title}
        onPress={() => answerAlert(request, action.key, text)}
        testID={`alert-action-${action.key}`}
      />
    </View>
  ));
  return (
    <View
      style={[
        styles.backdrop,
        isAlert ? styles.center : [styles.bottom, { paddingBottom: insets.bottom + spacing.xs }],
      ]}
    >
      {isAlert ? null : (
        <Pressable
          style={styles.grow}
          onPress={() => request.cancelLabel !== null && answerAlert(request, null)}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      )}
      <View
        style={[styles.panel, isAlert ? styles.alert : styles.dialog]}
        accessibilityViewIsModal
        testID={`alert-${request.presentation}`}
      >
        <View style={styles.text}>
          <Text
            variant="headline"
            accessibilityRole="header"
            style={isAlert ? styles.centered : undefined}
          >
            {request.title}
          </Text>
          {request.message ? (
            <Text tone="secondary" style={isAlert ? styles.centered : undefined}>
              {request.message}
            </Text>
          ) : null}
        </View>
        {request.field ? (
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder={request.field.placeholder}
            placeholderTextColor={theme.colors.textTertiary}
            selectionColor={theme.colors.accent}
            autoFocus
            selectTextOnFocus
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={() => answerAlert(request, 'confirm', text)}
            testID={request.field.testID ?? 'alert-field'}
          />
        ) : null}
        {isAlert && request.actions.length === 1 ? (
          <View style={styles.row}>
            {cancel}
            {actions}
          </View>
        ) : (
          <View style={styles.column}>
            {actions}
            {cancel}
          </View>
        )}
      </View>
    </View>
  );
}
