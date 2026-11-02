import { Pressable, View } from 'react-native';
import { ActionMenuButton, type ActionMenuItem } from '../overlay/ActionMenu';
import { GlassCapsule } from '../primitives/GlassCapsule';
import { Icon } from '../primitives/Icon';
import { makeStyles } from '../theme/theme';
import { type AgentBarLabels, defaultAgentBarLabels } from './agentBarLabels';

const useStyles = makeStyles((t) => ({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: t.spacing.sm,
    paddingTop: t.spacing.sm,
  },
  circle: {
    width: t.metrics.minTapSize,
    height: t.metrics.minTapSize,
    justifyContent: 'center',
    alignItems: 'center',
  },
  press: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
}));

export interface AgentHeaderProps {
  /** Opens the SessionDrawer. */
  onSidebar: () => void;
  /** The header menu: Chat/Terminal toggle, Changes, Files, Ports, Rename, Close. */
  menu: readonly ActionMenuItem[];
  /** Which surface the Agent shows; only the menu's wording differs, so it is exposed for tests. */
  surface?: 'chat' | 'terminal';
  labels?: Pick<AgentBarLabels, 'sidebar' | 'more'>;
  testID?: string;
}

/**
 * Agent detail's chrome: two floating glass circles over the content (sessions at the left,
 * the menu at the right), no title bar. The content scrolls under them.
 */
export function AgentHeader({
  onSidebar,
  menu,
  surface = 'chat',
  labels = defaultAgentBarLabels,
  testID = 'agent-header',
}: AgentHeaderProps) {
  const styles = useStyles();
  return (
    <View style={styles.row} testID={testID} accessibilityLabel={surface} pointerEvents="box-none">
      <GlassCapsule style={styles.circle} testID={`${testID}-left`}>
        <Pressable
          style={styles.press}
          onPress={onSidebar}
          accessibilityRole="button"
          accessibilityLabel={labels.sidebar}
          testID={`${testID}-sidebar`}
        >
          <Icon name="sidebar" size={20} color="textPrimary" />
        </Pressable>
      </GlassCapsule>
      <GlassCapsule style={styles.circle} testID={`${testID}-right`}>
        <ActionMenuButton
          items={menu}
          accessibilityLabel={labels.more}
          icon="more"
          testID={`${testID}-more`}
        />
      </GlassCapsule>
    </View>
  );
}
