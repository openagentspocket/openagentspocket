import { useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { Button } from '../primitives/Button';
import { Icon, type IconName } from '../primitives/Icon';
import { Text } from '../primitives/Text';
import { makeStyles, useTheme } from '../theme/theme';

export interface SkillItem {
  id: string;
  /** The slash command ("/review"). */
  command: string;
  /** The display name, used as the accessibility label. */
  name: string;
  description?: string;
  scope: 'project' | 'global';
}

export type SkillsPhase = 'idle' | 'loading' | 'loaded' | 'failed';

export interface PaneSwitcherItem {
  key: string;
  icon: IconName;
  label: string;
}

export interface SkillsKeyboardPaneLabels {
  project: string;
  global: string;
  empty: string;
  refresh: string;
  retry: string;
  /** Accessibility hint of a row: "Inserts /x without sending it". */
  insertHint: (command: string) => string;
}

export const defaultSkillsPaneLabels: SkillsKeyboardPaneLabels = {
  project: 'Project',
  global: 'Global',
  empty: 'No skills found for this agent.',
  refresh: 'Refresh',
  retry: 'Retry',
  insertHint: (command) => `Inserts ${command} without sending it`,
};

const useStyles = makeStyles((t) => ({
  pane: { backgroundColor: t.colors.canvas },
  body: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: t.spacing.sm },
  message: { textAlign: 'center', paddingHorizontal: t.spacing.lg },
  sectionTitle: {
    textTransform: 'uppercase',
    paddingHorizontal: t.metrics.screenInset,
    paddingTop: t.spacing.sm,
    paddingBottom: t.spacing.xxs,
  },
  row: {
    paddingHorizontal: t.metrics.screenInset,
    paddingVertical: t.spacing.sm,
    gap: 3,
    borderBottomWidth: t.metrics.hairlineWidth,
    borderBottomColor: t.hairline,
  },
  pressed: { backgroundColor: t.colors.surfaceRaised },
  refreshRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xs,
    paddingHorizontal: t.metrics.screenInset,
    paddingVertical: t.spacing.md,
    borderTopWidth: t.metrics.hairlineWidth,
    borderTopColor: t.hairline,
  },
  switcher: {
    flexDirection: 'row',
    paddingHorizontal: t.spacing.xxs,
    paddingTop: t.spacing.xxs,
    paddingBottom: t.spacing.xs,
    gap: t.spacing.xxs,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: t.metrics.minTapSize - 4,
    borderRadius: t.metrics.cardRadius * 1.5,
  },
  tabSelected: { backgroundColor: t.colors.control },
}));

interface SkillsKeyboardPaneProps {
  skills: readonly SkillItem[];
  phase?: SkillsPhase;
  /** The load failure message, shown with Retry when there are no skills yet. */
  errorMessage?: string;
  /** Filters by command, name and description (case-insensitive). */
  query?: string;
  /** Tap: insert `/skill ` into the composer without sending. */
  onPick: (skill: SkillItem) => void;
  onRefresh: () => void;
  /** Long press: open the content sheet. */
  onOpen: (skill: SkillItem) => void;
  /** The bottom pane switcher; omit to hide it. */
  panes?: readonly PaneSwitcherItem[];
  selectedPane?: string;
  onSelectPane?: (key: string) => void;
  /** The pane height (the system keyboard's). */
  height?: number;
  labels?: Partial<SkillsKeyboardPaneLabels>;
  testID?: string;
}

function matches(skill: SkillItem, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [skill.command, skill.name, skill.description ?? ''].some((field) =>
    field.toLowerCase().includes(needle),
  );
}

/**
 * The Skills pane inside the Keys keyboard: slash-callable skills as a two-line list (command,
 * description) grouped Project then Global, a Refresh row pinned under the list and the pane
 * switcher at the bottom. Tap inserts, long press opens the content.
 */
export function SkillsKeyboardPane({
  skills,
  phase = 'loaded',
  errorMessage,
  query = '',
  onPick,
  onRefresh,
  onOpen,
  panes,
  selectedPane,
  onSelectPane,
  height = 234,
  labels,
  testID = 'skills-pane',
}: SkillsKeyboardPaneProps) {
  const styles = useStyles();
  const theme = useTheme();
  const text = { ...defaultSkillsPaneLabels, ...labels };
  const shown = useMemo(() => skills.filter((skill) => matches(skill, query)), [skills, query]);
  const groups = [
    { title: text.project, items: shown.filter((skill) => skill.scope === 'project') },
    { title: text.global, items: shown.filter((skill) => skill.scope === 'global') },
  ].filter((group) => group.items.length > 0);
  const refreshing = phase === 'loading';

  const body = () => {
    if (skills.length === 0 && (phase === 'idle' || phase === 'loading'))
      return (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.textSecondary} testID="skills-pane-loading" />
        </View>
      );
    if (skills.length === 0 && phase === 'failed')
      return (
        <View style={styles.center} testID="skills-pane-failed">
          <Text variant="caption" tone="secondary" style={styles.message}>
            {errorMessage ?? ''}
          </Text>
          <Button kind="secondary" size="small" title={text.retry} onPress={onRefresh} />
        </View>
      );
    if (shown.length === 0)
      return (
        <View style={styles.center} testID="skills-pane-empty">
          <Text variant="caption" tone="secondary" style={styles.message}>
            {text.empty}
          </Text>
        </View>
      );
    return (
      <ScrollView testID="skills-pane-list">
        {groups.map((group) => (
          <View key={group.title}>
            <Text
              variant="caption2"
              tone="secondary"
              semibold
              accessibilityRole="header"
              style={styles.sectionTitle}
            >
              {group.title}
            </Text>
            {group.items.map((skill) => (
              <Pressable
                key={skill.id}
                onPress={() => onPick(skill)}
                onLongPress={() => onOpen(skill)}
                accessibilityRole="button"
                accessibilityLabel={skill.name}
                accessibilityHint={text.insertHint(skill.command)}
                testID={`skill-row-${skill.id}`}
                style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
              >
                <Text variant="subheadline" monospaced semibold numberOfLines={1}>
                  {skill.command}
                </Text>
                {skill.description ? (
                  <Text variant="caption" tone="secondary" numberOfLines={1}>
                    {skill.description}
                  </Text>
                ) : null}
              </Pressable>
            ))}
          </View>
        ))}
      </ScrollView>
    );
  };

  return (
    <View style={[styles.pane, { height }]} testID={testID}>
      <View style={styles.body}>{body()}</View>
      <Pressable
        onPress={onRefresh}
        disabled={refreshing}
        accessibilityRole="button"
        accessibilityLabel={text.refresh}
        accessibilityState={{ disabled: refreshing }}
        testID="skills-pane-refresh"
        style={styles.refreshRow}
      >
        <Icon name="refresh" size={17} color="accent" />
        <Text variant="subheadline" tone="accent">
          {text.refresh}
        </Text>
        {refreshing && skills.length > 0 ? (
          <ActivityIndicator size="small" color={theme.colors.textSecondary} />
        ) : null}
      </Pressable>
      {panes?.length ? (
        <View style={styles.switcher} accessibilityRole="tablist" testID="skills-pane-switcher">
          {panes.map((pane) => {
            const selected = pane.key === selectedPane;
            return (
              <Pressable
                key={pane.key}
                onPress={() => onSelectPane?.(pane.key)}
                accessibilityRole="tab"
                accessibilityLabel={pane.label}
                accessibilityState={{ selected }}
                testID={`pane-${pane.key}`}
                style={[styles.tab, selected ? styles.tabSelected : null]}
              >
                <Icon name={pane.icon} size={20} color={selected ? 'accent' : 'textSecondary'} />
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
