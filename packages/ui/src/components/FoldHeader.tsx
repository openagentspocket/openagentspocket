import { View } from 'react-native';
import { Badge } from '../primitives/Badge';
import { Icon } from '../primitives/Icon';
import { DisclosureChevron } from '../primitives/SectionHeader';
import { Tappable } from '../primitives/Tappable';
import { Text } from '../primitives/Text';
import type { Status, Tone } from '../theme/status';
import { makeStyles, useTheme } from '../theme/theme';
import { type AgentRowLabels, defaultAgentRowLabels } from './agentRowLabels';

export type FoldHeaderKind = 'status' | 'host' | 'inbox' | 'footer';

export interface FoldPill {
  status: Status;
  /** "2 working": the words come from the caller's translations. */
  label: string;
}

const useStyles = makeStyles((t) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xs,
    paddingVertical: t.spacing.xs,
    minHeight: t.metrics.minTapSize,
  },
  inbox: { minHeight: 0 },
  footer: { paddingVertical: t.spacing.xs },
  grow: { flex: 1, flexShrink: 1 },
  title: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs, flexShrink: 1 },
  glyph: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  dot: {
    ...({ position: 'absolute', right: 0, bottom: 1 } as const),
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: t.colors.canvas,
  },
  pills: { flexDirection: 'row', gap: t.spacing.xxs },
  pill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
}));

interface FoldHeaderProps {
  kind: FoldHeaderKind;
  title: string;
  count?: number;
  /** Status kind: a secondary word after a headline title (a workspace's Host). */
  subtitle?: string;
  /** Host: the connection tone of the dot on the glyph. */
  hostTone?: Tone;
  /** Host, expanded: a short readiness sentence ("Ready"). */
  readiness?: string;
  /** Host, collapsed: the status counts. */
  pills?: readonly FoldPill[];
  collapsed?: boolean;
  /** Absent while searching or when the header cannot fold. */
  onToggle?: () => void;
  /** Footer: the accent action on the right. */
  onSeeAll?: () => void;
  labels?: AgentRowLabels;
  testID?: string;
}

/**
 * The header of an Agents list section: a status group ("Needs you 1"), a Host (glyph, name,
 * readiness or count pills), a Home section title or the "1 idle  See all" footer. Folds with a
 * turning chevron.
 */
export function FoldHeader({
  kind,
  title,
  count,
  subtitle,
  hostTone = 'success',
  readiness,
  pills,
  collapsed = false,
  onToggle,
  onSeeAll,
  labels = defaultAgentRowLabels,
  testID = 'fold-header',
}: FoldHeaderProps) {
  const styles = useStyles();
  const theme = useTheme();
  const foldable = Boolean(onToggle) && (kind === 'status' || kind === 'host');
  const heading =
    kind === 'host' ? (
      <>
        <View style={styles.glyph}>
          <Icon name="server" size={22} color="textSecondary" />
          <View
            style={[styles.dot, { backgroundColor: theme.tone(hostTone) }]}
            testID="fold-host-dot"
          />
        </View>
        <Text variant="subheadline" semibold numberOfLines={1} style={styles.title}>
          {title}
        </Text>
        {collapsed && pills?.length ? (
          <View style={styles.pills}>
            {pills.map((pill) => (
              <View
                key={pill.status}
                style={[styles.pill, { backgroundColor: theme.wash(theme.status(pill.status)) }]}
                testID={`fold-pill-${pill.status}`}
              >
                <Text variant="caption2" semibold style={{ color: theme.status(pill.status) }}>
                  {pill.label}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
        {!collapsed && readiness ? (
          <Text variant="footnote" tone="secondary" numberOfLines={1}>
            {readiness}
          </Text>
        ) : null}
      </>
    ) : kind === 'footer' ? (
      <Text variant="subheadline" tone="secondary" numberOfLines={1} style={styles.grow}>
        {title}
      </Text>
    ) : (
      <>
        <Text
          variant={subtitle ? 'headline' : 'subheadline'}
          semibold={!subtitle}
          tone={subtitle ? 'primary' : 'secondary'}
          numberOfLines={1}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text tone="secondary" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        {count !== undefined ? <Badge label={String(count)} kind="control" /> : null}
      </>
    );
  const style = [styles.row, kind === 'inbox' && styles.inbox, kind === 'footer' && styles.footer];
  if (kind === 'footer') {
    return (
      <View style={style} testID={testID}>
        {heading}
        {onSeeAll ? (
          <Tappable
            onPress={onSeeAll}
            accessibilityRole="button"
            accessibilityLabel={labels.seeAll}
            hitSlop={10}
          >
            <Text variant="subheadline" semibold tone="accent">
              {labels.seeAll}
            </Text>
          </Tappable>
        ) : null}
      </View>
    );
  }
  const content = (
    <>
      <View style={[styles.title, styles.grow]}>{heading}</View>
      {foldable ? <DisclosureChevron expanded={!collapsed} /> : null}
    </>
  );
  return foldable ? (
    <Tappable
      onPress={onToggle}
      style={style}
      accessibilityRole="header"
      accessibilityLabel={count !== undefined ? `${title}, ${count}` : title}
      accessibilityState={{ expanded: !collapsed }}
      testID={testID}
    >
      {content}
    </Tappable>
  ) : (
    <View style={style} accessible accessibilityRole="header" testID={testID}>
      {content}
    </View>
  );
}
