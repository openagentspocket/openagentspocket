import { Card, GlassCapsule, Icon, makeStyles, Text } from '@openagentspocket/ui';
import type { SettingsContext } from './schema';

const useStyles = makeStyles((th) => ({
  stage: { alignItems: 'center', padding: th.spacing.lg },
  capsule: { gap: th.spacing.md, paddingHorizontal: th.spacing.md },
}));

/** The terminal key bar as the current toggles would draw it: Ctrl always, then the chosen keys. */
export function ToolbarPreview({ ctx }: { ctx: SettingsContext }) {
  const styles = useStyles();
  const { toolbarEscape, toolbarTab, toolbarDPad } = ctx.values;
  const keys = ['Ctrl', ...(toolbarEscape ? ['Esc'] : []), ...(toolbarTab ? ['Tab'] : [])];
  return (
    <Card decorative style={styles.stage} testID="settings.toolbar.preview">
      <GlassCapsule style={styles.capsule}>
        {keys.map((key) => (
          <Text key={key} variant="mono" semibold>
            {key}
          </Text>
        ))}
        {toolbarDPad ? <Icon name="dpad" size={20} /> : null}
        <Icon name="keyboard" size={20} />
        <Icon name="more" size={20} />
      </GlassCapsule>
    </Card>
  );
}
