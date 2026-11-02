import { t } from '@openagentspocket/i18n';
import { Button, makeStyles } from '@openagentspocket/ui';
import { View } from 'react-native';

const useStyles = makeStyles((th) => ({
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: th.spacing.xxs,
    borderTopWidth: th.metrics.hairlineWidth,
    borderTopColor: th.hairline,
    backgroundColor: th.colors.surface,
  },
}));

interface PreviewToolbarProps {
  /** A page is on screen: Back, Forward and Share work only then. */
  isOpen: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  /** The tunnel is still opening: Reload waits. */
  isOpening: boolean;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onShare: () => void;
}

/** The preview's bottom bar: Back, Forward, Reload and Share. */
export function PreviewToolbar(props: PreviewToolbarProps) {
  const styles = useStyles();
  return (
    <View style={styles.bar} testID="preview-toolbar">
      <Button
        kind="text"
        icon="arrowLeft"
        accessibilityLabel={t('Back')}
        disabled={!props.isOpen || !props.canGoBack}
        onPress={props.onBack}
        testID="preview-back"
      />
      <Button
        kind="text"
        icon="arrowRight"
        accessibilityLabel={t('Forward')}
        disabled={!props.isOpen || !props.canGoForward}
        onPress={props.onForward}
        testID="preview-forward"
      />
      <Button
        kind="text"
        icon="refresh"
        accessibilityLabel={t('Reload')}
        disabled={props.isOpening}
        onPress={props.onReload}
        testID="preview-reload"
      />
      <Button
        kind="text"
        icon="share"
        accessibilityLabel={t('Share')}
        disabled={!props.isOpen}
        onPress={props.onShare}
        testID="preview-share"
      />
    </View>
  );
}
