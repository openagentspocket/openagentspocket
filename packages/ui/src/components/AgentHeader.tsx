import { View } from 'react-native';
import { ActionMenu, ActionMenuButton, type ActionMenuItem } from '../overlay/ActionMenu';
import { useContextMenu } from '../overlay/useContextMenu';
import { Button } from '../primitives/Button';
import { Chip } from '../primitives/Chip';
import { GlassCapsule } from '../primitives/GlassCapsule';
import { Icon } from '../primitives/Icon';
import { StatusDot } from '../primitives/StatusDot';
import { Tappable } from '../primitives/Tappable';
import { Text } from '../primitives/Text';
import { CHROME_TOP_GAP } from '../theme/chrome';
import { airy } from '../theme/metrics';
import { makeStyles, useTheme } from '../theme/theme';
import { type AgentBarLabels, defaultAgentBarLabels } from './agentBarLabels';

/** A small line is shorter than a finger: the press reaches past it on every side. */
const LINE_SLOP = 10;

const useStyles = makeStyles((t) => ({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: t.spacing.sm,
    gap: t.spacing.xs,
    paddingTop: CHROME_TOP_GAP,
  },
  titles: { flex: 1, minWidth: 0, gap: airy.line },
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
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xxs },
  shrink: { flexShrink: 1, minWidth: 0 },
  line: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs },
  git: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xxs, flexShrink: 1 },
  note: { flexShrink: 0 },
  sidebarDot: { position: 'absolute', top: t.spacing.xxs, right: t.spacing.xxs },
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
  /** The Agent's checkout, as one small line under the titles. */
  branch?: string;
  diff?: { added: number; removed: number };
  /** Tapping the branch line opens Changes. */
  onOpenChanges?: () => void;
  /** A short word on the link ("Reconnecting…", "850 ms"), only while it is slow or lost. */
  /** The Agent's mode as its screen names it (Plan Mode, Auto Mode); a small chip on the checkout line. */
  mode?: string;
  note?: string;
  /** Tapping the title opens this menu: the Host's Agents. */
  titleMenu?: readonly ActionMenuItem[];
  /** Another Agent needs the user: a dot on the Sessions button. */
  sidebarDot?: boolean;
  labels?: Pick<
    AgentBarLabels,
    'sidebar' | 'more' | 'home' | 'openChanges' | 'switcher' | 'needsYou'
  >;
  testID?: string;
}

/** Branch and diff, tappable on their own, and the link's note beside them. */
function CheckoutLine({
  branch,
  diff,
  onOpenChanges,
  note,
  mode,
  hint,
  testID,
}: Pick<AgentHeaderProps, 'branch' | 'diff' | 'onOpenChanges' | 'note' | 'mode'> & {
  hint: string;
  testID: string;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const summary = [branch, diff ? `+${diff.added} -${diff.removed}` : null]
    .filter(Boolean)
    .join(', ');
  if (!summary && !note && !mode) return null;
  return (
    <View style={styles.line} pointerEvents="box-none">
      {summary ? (
        <Tappable
          style={styles.git}
          onPress={onOpenChanges}
          disabled={!onOpenChanges}
          hitSlop={LINE_SLOP}
          accessibilityRole={onOpenChanges ? 'button' : 'text'}
          accessibilityLabel={summary}
          accessibilityHint={onOpenChanges ? hint : undefined}
          testID={`${testID}-git`}
        >
          {branch ? (
            <>
              <Icon name="branch" size={13} tint={theme.colors.info} />
              <Text
                variant="caption"
                monospaced
                semibold
                numberOfLines={1}
                style={[styles.shrink, { color: theme.colors.info }]}
              >
                {branch}
              </Text>
            </>
          ) : null}
          {diff ? (
            <>
              <Text variant="caption" monospaced semibold tone="success" tabularNums>
                {`+${diff.added}`}
              </Text>
              <Text variant="caption" monospaced semibold tone="danger" tabularNums>
                {`−${diff.removed}`}
              </Text>
            </>
          ) : null}
        </Tappable>
      ) : null}
      {mode ? <Chip label={mode} size="small" testID={`${testID}-mode`} /> : null}
      {note ? (
        <View style={styles.note} pointerEvents="none">
          <Text
            variant="caption"
            monospaced
            tone="warning"
            tabularNums
            numberOfLines={1}
            testID={`${testID}-note`}
          >
            {note}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * Agent detail's chrome: two glass circles (sessions at the left, the menu at the right) with the
 * Agent's eyebrow, mono title and checkout line between them. The content scrolls under it. Only the
 * title and the checkout line take touches; the rest of the block lets them through.
 */
export function AgentHeader({
  onSidebar,
  onHome,
  menu,
  surface = 'chat',
  eyebrow,
  title,
  subtitle,
  branch,
  diff,
  onOpenChanges,
  note,
  mode,
  titleMenu,
  sidebarDot = false,
  labels = defaultAgentBarLabels,
  testID = 'agent-header',
}: AgentHeaderProps) {
  const styles = useStyles();
  const agents = useContextMenu();
  const titleText = title ? (
    <Text variant="headline" monospaced semibold numberOfLines={1} style={styles.shrink}>
      {title}
    </Text>
  ) : null;
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
        <View>
          <Button
            kind="text"
            neutral
            icon="sidebar"
            iconSize={20}
            accessibilityLabel={
              sidebarDot ? `${labels.sidebar}, ${labels.needsYou}` : labels.sidebar
            }
            onPress={onSidebar}
            testID={`${testID}-sidebar`}
          />
          {sidebarDot ? (
            <View style={styles.sidebarDot} pointerEvents="none" testID={`${testID}-sidebar-dot`}>
              <StatusDot status="blocked" size={9} />
            </View>
          ) : null}
        </View>
      </GlassCapsule>
      <View style={styles.titles} pointerEvents="box-none" testID={`${testID}-titles`}>
        {eyebrow ? (
          <View pointerEvents="none">
            <Text variant="caption" semibold tone="accent" numberOfLines={1}>
              {eyebrow.toUpperCase()}
            </Text>
          </View>
        ) : null}
        {titleText && titleMenu?.length ? (
          <Tappable
            style={styles.titleRow}
            onPress={agents.open}
            accessibilityRole="button"
            accessibilityLabel={title}
            accessibilityHint={labels.switcher}
            testID={`${testID}-title`}
          >
            {titleText}
            <Icon name="chevronUpDown" size={12} color="textSecondary" />
          </Tappable>
        ) : titleText ? (
          <View pointerEvents="none">{titleText}</View>
        ) : null}
        {subtitle ? (
          <View pointerEvents="none">
            <Text variant="footnote" monospaced tone="secondary" numberOfLines={1}>
              {subtitle}
            </Text>
          </View>
        ) : null}
        <CheckoutLine
          branch={branch}
          diff={diff}
          onOpenChanges={onOpenChanges}
          note={note}
          mode={mode}
          hint={labels.openChanges}
          testID={testID}
        />
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
      {titleMenu?.length ? (
        <ActionMenu
          items={titleMenu}
          title={labels.switcher}
          testID={`${testID}-agents`}
          {...agents.menuProps}
        />
      ) : null}
    </View>
  );
}
