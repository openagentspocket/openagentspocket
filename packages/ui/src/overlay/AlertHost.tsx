import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { noFocusRing, Tappable } from '../primitives/Tappable';
import { monoFamily, Text } from '../primitives/Text';
import { ThemedTextInput } from '../primitives/ThemedTextInput';
import { rounded } from '../theme/corners';
import { useInsets } from '../theme/insets';
import { spacing } from '../theme/metrics';
import { makeStyles, useTheme } from '../theme/theme';
import { typography } from '../theme/typography';
import { AlertLayer } from './AlertLayer';
import { type AnchorRect, measureAnchor } from './anchors';
import { type AlertRequest, alertQueue, answerAlert } from './confirm';
import { useActiveHost, useQueue } from './store';

const useStyles = makeStyles((t) => ({
  backdrop: { flex: 1, backgroundColor: t.backdrop },
  // A popover dims nothing, like iOS: the screen behind stays as bright as it is.
  clear: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center', padding: t.metrics.screenInset },
  bottom: { justifyContent: 'flex-end', paddingHorizontal: t.spacing.xs },
  // Swift alerts are glass panels with the sheet's large radius, not the card's.
  panel: {
    backgroundColor: t.colors.surfaceOverlay,
    ...rounded(t.radius.sheet),
    borderWidth: t.metrics.hairlineWidth,
    borderColor: t.hairline,
    padding: t.spacing.md,
    gap: t.spacing.sm,
  },
  alert: { width: '100%', maxWidth: 340 },
  popover: { position: 'absolute', width: POPOVER_WIDTH },
  arrow: {
    position: 'absolute',
    width: 16,
    height: 16,
    transform: [{ rotate: '45deg' }],
    backgroundColor: t.colors.surfaceOverlay,
    borderColor: t.hairline,
  },
  arrowDown: {
    bottom: -8,
    borderRightWidth: t.metrics.hairlineWidth,
    borderBottomWidth: t.metrics.hairlineWidth,
  },
  arrowUp: {
    top: -8,
    borderLeftWidth: t.metrics.hairlineWidth,
    borderTopWidth: t.metrics.hairlineWidth,
  },
  dialog: { width: '100%', maxWidth: t.metrics.readableWidth, alignSelf: 'center' },
  text: { gap: t.spacing.xxs },
  row: { flexDirection: 'row', gap: t.spacing.xs },
  grow: { flex: 1 },
  column: { gap: t.spacing.xs },
  pill: {
    minHeight: 48,
    borderRadius: t.radius.capsule,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: t.spacing.xs,
    backgroundColor: t.colors.control,
  },
  pressed: { opacity: 0.7 },
  input: {
    minHeight: t.metrics.minTapSize,
    paddingHorizontal: t.spacing.sm,
    ...rounded(t.radius.control),
    borderWidth: t.metrics.hairlineWidth,
    borderColor: t.hairline,
    backgroundColor: t.colors.control,
    color: t.colors.textPrimary,
    fontSize: typography.subheadline.fontSize,
    fontFamily: monoFamily,
  },
}));

const POPOVER_WIDTH = 280;
const EDGE = 12;
const POLL_MS = 150;
const POLLS = 12;
const GAP = 12;

/** Draws the request at the head of the confirm() queue. Mounted once, by OverlayHost. */
export function AlertHost() {
  useWebModalNoRing();
  const active = useActiveHost('alert');
  const queue = useQueue(alertQueue);
  const current = active ? queue[0] : undefined;
  return (
    <AlertLayer
      visible={current !== undefined}
      onRequestClose={() => current && answerAlert(current, null)}
    >
      {current ? <AlertPanel request={current} /> : null}
    </AlertLayer>
  );
}

/** A pill like the Swift alert buttons: control fill, the label in its own ink. */
function AlertButton({
  title,
  tone,
  onPress,
  testID,
}: {
  title: string;
  tone: 'accent' | 'danger';
  onPress: () => void;
  testID: string;
}) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Tappable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [styles.pill, noFocusRing, pressed && styles.pressed]}
      testID={testID}
    >
      <Text variant="headline" numberOfLines={1} style={{ color: theme.colors[tone] }}>
        {title}
      </Text>
    </Tappable>
  );
}

function AlertPanel({ request }: { request: AlertRequest }) {
  const styles = useStyles();
  const insets = useInsets();
  const window = useWindowDimensions();
  const theme = useTheme();
  const [text, setText] = useState(request.field?.initial ?? '');
  const isAlert = request.presentation === 'alert';
  const isPopover = request.presentation === 'popover';
  const [rect, setRect] = useState<AnchorRect | null>(null);
  const [measured, setMeasured] = useState(!isPopover || !request.anchorKey);
  useEffect(() => {
    if (!isPopover || !request.anchorKey) return;
    let live = true;
    const key = request.anchorKey;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // An anchor inside a sheet is still sliding in on the first reads: keep measuring for a
    // short budget and keep the latest frame.
    const measure = (left: number) =>
      void measureAnchor(key).then((found) => {
        if (!live) return;
        setRect((previous) =>
          previous && found && previous.x === found.x && previous.y === found.y ? previous : found,
        );
        setMeasured(true);
        if (left > 0) timer = setTimeout(() => measure(left - 1), POLL_MS);
      });
    measure(POLLS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [isPopover, request.anchorKey]);
  // iOS stacks the buttons when their labels would not fit on one line side by side.
  const sideBySide =
    isAlert &&
    request.actions.length === 1 &&
    request.cancelLabel !== null &&
    (request.actions[0]?.title.length ?? 0) <= 14;
  const cancel =
    request.cancelLabel === null || isPopover ? null : (
      <View style={sideBySide ? styles.grow : undefined}>
        <AlertButton
          title={request.cancelLabel}
          tone="accent"
          onPress={() => answerAlert(request, null)}
          testID="alert-cancel"
        />
      </View>
    );
  const actions = request.actions.map((action) => (
    <View key={action.key} style={sideBySide ? styles.grow : undefined}>
      <AlertButton
        title={action.title}
        tone={action.destructive ? 'danger' : 'accent'}
        onPress={() => answerAlert(request, action.key, text)}
        testID={`alert-action-${action.key}`}
      />
    </View>
  ));
  const body = (
    <>
      <View style={styles.text}>
        <Text variant="headline" accessibilityRole="header">
          {request.title}
        </Text>
        {request.message ? <Text tone="secondary">{request.message}</Text> : null}
      </View>
      {request.field ? (
        <ThemedTextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder={request.field.placeholder}
          autoFocus
          selectTextOnFocus
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={() => answerAlert(request, 'confirm', text)}
          testID={request.field.testID ?? 'alert-field'}
        />
      ) : null}
      {sideBySide ? (
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
    </>
  );

  if (isPopover) {
    const dismiss = (
      <Tappable
        style={StyleSheet.absoluteFill}
        testID="alert-dismiss"
        onPress={() => answerAlert(request, null)}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
    );
    if (!measured) return <View style={[styles.clear, noFocusRing]}>{dismiss}</View>;
    const width = Math.min(POPOVER_WIDTH, window.width - 2 * EDGE);
    const centerX = rect ? rect.x + rect.width / 2 : window.width / 2;
    const left = Math.max(EDGE, Math.min(centerX - width / 2, window.width - EDGE - width));
    const arrowLeft = Math.max(28, Math.min(centerX - left, width - 28)) - 8;
    // Above the control when it sits in the lower half, below it otherwise (Swift picks the side with room).
    const below = rect ? rect.y + rect.height / 2 < window.height / 2 : false;
    const place = rect
      ? below
        ? { top: rect.y + rect.height + GAP }
        : { bottom: window.height - rect.y + GAP }
      : { bottom: insets.bottom + 72 };
    return (
      <View style={[styles.clear, noFocusRing]}>
        {dismiss}
        <View
          style={[noFocusRing, styles.panel, styles.popover, { left, width }, place]}
          accessibilityViewIsModal
          testID="alert-popover"
        >
          {body}
          <View
            style={[styles.arrow, below ? styles.arrowUp : styles.arrowDown, { left: arrowLeft }]}
            testID="alert-popover-arrow"
          />
        </View>
      </View>
    );
  }

  return (
    // Padding while the keyboard is up keeps a prompt's text field above it.
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[
        styles.backdrop,
        noFocusRing,
        isAlert ? styles.center : [styles.bottom, { paddingBottom: insets.bottom + spacing.xs }],
      ]}
    >
      {isAlert ? null : (
        <Tappable
          style={styles.grow}
          onPress={() => request.cancelLabel !== null && answerAlert(request, null)}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      )}
      <View
        style={[noFocusRing, styles.panel, isAlert ? styles.alert : styles.dialog]}
        accessibilityViewIsModal
        testID={`alert-${request.presentation}`}
      >
        {body}
      </View>
    </KeyboardAvoidingView>
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
