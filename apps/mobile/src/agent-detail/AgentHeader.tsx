import { t } from '@openagentspocket/i18n';
import {
  ActionMenuButton,
  type ActionMenuItem,
  GlassCapsule,
  Icon,
  makeStyles,
} from '@openagentspocket/ui';
import { Pressable, View } from 'react-native';

const SIZE = 44;

const useStyles = makeStyles((th) => ({
  // Swift AgentDetailHeader: two 44 pt glass circles floating over the content, nothing between.
  row: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: th.spacing.md,
    paddingTop: th.spacing.xs,
  },
  circle: { width: SIZE, height: SIZE, justifyContent: 'center' },
  tap: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
}));

interface Props {
  onSessions: () => void;
  /** The "..." menu (Changes, Ports, New Agent); hidden when empty. */
  items?: readonly ActionMenuItem[];
}

/** The floating header: the Sessions circle on the leading side, "..." on the trailing side. */
export function AgentHeader({ onSessions, items = [] }: Props) {
  const styles = useStyles();
  return (
    <View style={styles.row} pointerEvents="box-none" testID="agent-header">
      <GlassCapsule style={styles.circle}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Sessions')}
          onPress={onSessions}
          style={styles.tap}
          testID="agent-sessions"
        >
          <Icon name="sidebar" color="textPrimary" size={18} />
        </Pressable>
      </GlassCapsule>
      {items.length > 0 ? (
        <GlassCapsule style={styles.circle}>
          <ActionMenuButton items={items} accessibilityLabel={t('More')} testID="agent-more-menu" />
        </GlassCapsule>
      ) : null}
    </View>
  );
}
