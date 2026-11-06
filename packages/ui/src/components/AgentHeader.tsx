import { View } from 'react-native';
import { ActionMenuButton, type ActionMenuItem } from '../overlay/ActionMenu';
import { Button } from '../primitives/Button';
import { GlassCapsule } from '../primitives/GlassCapsule';
import { Text } from '../primitives/Text';
import { makeStyles } from '../theme/theme';
import { type AgentBarLabels, defaultAgentBarLabels } from './agentBarLabels';

const useStyles = makeStyles((t) => ({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: t.spacing.sm,
    gap: t.spacing.xs,
    paddingTop: t.spacing.sm,
  },
  titles: { flex: 1, minWidth: 0, gap: 1 },
  circle: {
    width: t.metrics.minTapSize,
    height: t.metrics.minTapSize,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pair: {
    flexDirection: 'row',
    height: t.metrics.minTapSize,
    alignItems: 'center',
  },
}));

export interface AgentHeaderProps {
  /** Opens the SessionDrawer. */
  onSidebar: () => void;
  /** Back to Home; draws a Home button beside the Sessions one. */
  onHome?: () => void;
  /** The header menu: Chat/Terminal toggle, Changes, Files, Ports, Rename, Close. */
  menu: readonly ActionMenuItem[];
  /** Which surface the Agent shows; only the menu's wording differs, so it is exposed for tests. */
  surface?: 'chat' | 'terminal';
  /** Mid-bar identity: eyebrow "HOST · AGENT KIND", bold mono title, mono "workspace · branch". */
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  labels?: Pick<AgentBarLabels, 'sidebar' | 'more' | 'home'>;
  testID?: string;
}

/**
 * Agent detail's chrome: two glass circles (sessions at the left, the menu at the right) with the
 * Agent's eyebrow, mono title and mono subtitle between them. The content scrolls under it.
 */
export function AgentHeader({
  onSidebar,
  onHome,
  menu,
  surface = 'chat',
  eyebrow,
  title,
  subtitle,
  labels = defaultAgentBarLabels,
  testID = 'agent-header',
}: AgentHeaderProps) {
  const styles = useStyles();
  return (
    <View style={styles.row} testID={testID} accessibilityLabel={surface} pointerEvents="box-none">
      <GlassCapsule style={onHome ? styles.pair : styles.circle} testID={`${testID}-left`}>
        {onHome ? (
          <Button
            kind="text"
            neutral
            icon="home"
            iconSize={20}
            accessibilityLabel={labels.home}
            onPress={onHome}
            testID={`${testID}-home`}
          />
        ) : null}
        <Button
          kind="text"
          neutral
          icon="sidebar"
          iconSize={20}
          accessibilityLabel={labels.sidebar}
          onPress={onSidebar}
          testID={`${testID}-sidebar`}
        />
      </GlassCapsule>
      <View style={styles.titles} pointerEvents="none" testID={`${testID}-titles`}>
        {eyebrow ? (
          <Text variant="caption" semibold tone="accent" numberOfLines={1}>
            {eyebrow.toUpperCase()}
          </Text>
        ) : null}
        {title ? (
          <Text variant="headline" monospaced semibold numberOfLines={1}>
            {title}
          </Text>
        ) : null}
        {subtitle ? (
          <Text variant="footnote" monospaced tone="secondary" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <GlassCapsule style={styles.circle} testID={`${testID}-right`}>
        <ActionMenuButton
          items={menu}
          accessibilityLabel={labels.more}
          icon="more"
          iconSize={20}
          testID={`${testID}-more`}
        />
      </GlassCapsule>
    </View>
  );
}
