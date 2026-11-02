import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../primitives/Button';
import { Icon } from '../primitives/Icon';
import { Text } from '../primitives/Text';
import { makeStyles } from '../theme/theme';

export type ScannerFrameState = 'scanning' | 'unavailable' | 'denied';

const BRACKET = 28;
const useStyles = makeStyles((t) => ({
  root: { gap: t.spacing.md, alignItems: 'stretch' },
  viewfinder: {
    aspectRatio: 1,
    width: '100%',
    maxWidth: 360,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.surface,
    borderRadius: t.metrics.cardRadius,
    overflow: 'hidden',
  },
  corner: { position: 'absolute', width: BRACKET, height: BRACKET, borderColor: t.colors.accent },
  tl: { top: t.spacing.md, left: t.spacing.md, borderTopWidth: 3, borderLeftWidth: 3 },
  tr: { top: t.spacing.md, right: t.spacing.md, borderTopWidth: 3, borderRightWidth: 3 },
  bl: { bottom: t.spacing.md, left: t.spacing.md, borderBottomWidth: 3, borderLeftWidth: 3 },
  br: { bottom: t.spacing.md, right: t.spacing.md, borderBottomWidth: 3, borderRightWidth: 3 },
  hint: { textAlign: 'center' },
  notice: { alignItems: 'center', gap: t.spacing.sm, padding: t.metrics.screenInset },
  copy: { alignItems: 'center', gap: t.spacing.xxs, maxWidth: 440 },
  actions: { alignItems: 'center', gap: t.spacing.xs },
}));

export interface ScannerFrameLabels {
  hint: string;
  unavailableTitle: string;
  unavailableMessage: string;
  deniedTitle: string;
  deniedMessage: string;
  paste: string;
  manual: string;
  settings: string;
}

const DEFAULT_LABELS: ScannerFrameLabels = {
  hint: 'Point the camera at the Pairing Code',
  unavailableTitle: 'Scanning Unavailable',
  unavailableMessage:
    'This device cannot scan codes. Paste a Pairing Code or add the Host manually.',
  deniedTitle: 'Camera Access Needed',
  deniedMessage: 'Allow camera access in Settings, or paste a Pairing Code instead.',
  paste: 'Paste Pairing Code',
  manual: 'Add Manually',
  settings: 'Open Settings',
};

interface ScannerFrameProps {
  state: ScannerFrameState;
  /** The live camera preview, drawn inside the viewfinder while scanning. */
  camera?: ReactNode;
  onPaste: () => void;
  onManual: () => void;
  onOpenSettings?: () => void;
  labels?: Partial<ScannerFrameLabels>;
  testID?: string;
}

/** Pairing scan area: a square viewfinder with accent corner brackets, or an empty state with paste and manual actions. */
export function ScannerFrame({
  state,
  camera,
  onPaste,
  onManual,
  onOpenSettings,
  labels,
  testID = 'scanner-frame',
}: ScannerFrameProps) {
  const styles = useStyles();
  const all = { ...DEFAULT_LABELS, ...labels };
  if (state === 'scanning') {
    return (
      <View style={styles.root} testID={testID}>
        <View style={styles.viewfinder} testID={`${testID}-viewfinder`}>
          {camera ?? <Icon name="qr" size={56} color="textTertiary" />}
          {(['tl', 'tr', 'bl', 'br'] as const).map((corner) => (
            <View
              key={corner}
              style={[styles.corner, styles[corner]]}
              testID={`${testID}-${corner}`}
            />
          ))}
        </View>
        <Text variant="callout" tone="secondary" style={styles.hint}>
          {all.hint}
        </Text>
        <View style={styles.actions}>
          <Button
            kind="capsule"
            icon="copy"
            title={all.paste}
            onPress={onPaste}
            testID={`${testID}-paste`}
          />
        </View>
      </View>
    );
  }
  const denied = state === 'denied';
  return (
    <View style={styles.notice} testID={testID}>
      <Icon name="camera" size={48} />
      <View style={styles.copy}>
        <Text variant="title2" accessibilityRole="header" style={styles.hint}>
          {denied ? all.deniedTitle : all.unavailableTitle}
        </Text>
        <Text variant="callout" tone="secondary" style={styles.hint}>
          {denied ? all.deniedMessage : all.unavailableMessage}
        </Text>
      </View>
      <View style={styles.actions}>
        <Button kind="capsule" title={all.paste} onPress={onPaste} testID={`${testID}-paste`} />
        {denied && onOpenSettings ? (
          <Button kind="text" title={all.settings} onPress={onOpenSettings} />
        ) : null}
        <Button kind="text" title={all.manual} onPress={onManual} testID={`${testID}-manual`} />
      </View>
    </View>
  );
}
