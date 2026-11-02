import { useEffect } from 'react';
import { Modal, Platform, Pressable, View } from 'react-native';
import { Button, noFocusRing } from '../primitives/Button';
import { Text } from '../primitives/Text';
import { useInsets } from '../theme/insets';
import { spacing } from '../theme/metrics';
import { makeStyles } from '../theme/theme';
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
  popover: { width: '100%', maxWidth: 320, alignSelf: 'center', borderRadius: 20 },
  arrow: {
    alignSelf: 'center',
    width: 16,
    height: 16,
    marginTop: -9,
    transform: [{ rotate: '45deg' }],
    backgroundColor: t.colors.surfaceOverlay,
    borderRightWidth: t.metrics.hairlineWidth,
    borderBottomWidth: t.metrics.hairlineWidth,
    borderColor: t.hairline,
  },
  arrowEnd: { alignSelf: 'flex-end', marginRight: spacing.lg + spacing.xxs },
  dialog: { width: '100%', maxWidth: t.metrics.readableWidth, alignSelf: 'center' },
  text: { gap: t.spacing.xxs },
  centered: { textAlign: 'center' },
  row: { flexDirection: 'row', gap: t.spacing.xs },
  grow: { flex: 1 },
  column: { gap: t.spacing.xs },
}));

/** Draws the request at the head of the confirm() queue. Mounted once, by OverlayHost. */
export function AlertHost() {
  useWebModalNoRing();
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
  const isAlert = request.presentation === 'alert';
  const isPopover = request.presentation === 'popover';
  const cancel =
    request.cancelLabel === null || isPopover ? null : (
      <View style={isAlert ? styles.grow : undefined}>
        <Button
          kind="secondary"
          title={request.cancelLabel}
          onPress={() => answerAlert(request, null)}
          tight={isAlert}
          testID="alert-cancel"
        />
      </View>
    );
  const actions = request.actions.map((action, index) => (
    <View key={action.key} style={isAlert ? styles.grow : undefined}>
      <Button
        kind={action.destructive ? 'destructive' : index === 0 && isAlert ? 'primary' : 'secondary'}
        title={action.title}
        onPress={() => answerAlert(request, action.key)}
        tight={isAlert}
        testID={`alert-action-${action.key}`}
      />
    </View>
  ));
  return (
    <View
      style={[
        styles.backdrop,
        noFocusRing,
        isAlert
          ? styles.center
          : [
              styles.bottom,
              // A popover sits above the key toolbar (about 64 pt) and its arrow points down at it.
              { paddingBottom: insets.bottom + (isPopover ? 72 : spacing.xs) },
            ],
      ]}
    >
      {isAlert ? null : (
        <Pressable
          style={styles.grow}
          onPress={() => (isPopover || request.cancelLabel !== null) && answerAlert(request, null)}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      )}
      <View
        style={[
          noFocusRing,
          styles.panel,
          isAlert ? styles.alert : isPopover ? styles.popover : styles.dialog,
        ]}
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
      {isPopover ? (
        <View style={[styles.arrow, request.anchor === 'end' && styles.arrowEnd]} />
      ) : null}
    </View>
  );
}

/** Web only: react-native-web focuses the Modal's container, which the browser outlines in blue. */
function useWebModalNoRing() {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    // The package has no DOM typings; this branch only runs on web.
    const doc = (globalThis as unknown as { document?: WebDocument }).document;
    if (!doc || doc.getElementById('oap-no-modal-ring')) return;
    const style = doc.createElement('style');
    style.id = 'oap-no-modal-ring';
    style.textContent = '[aria-modal="true"], [aria-modal="true"] * { outline: none !important; }';
    doc.head.appendChild(style);
  }, []);
}

interface WebDocument {
  getElementById(id: string): unknown;
  createElement(tag: string): { id: string; textContent: string };
  head: { appendChild(node: unknown): void };
}
