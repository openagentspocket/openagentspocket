import { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { Icon } from '../primitives/Icon';
import { ProgramMark } from '../primitives/ProgramMark';
import { StatusDot } from '../primitives/StatusDot';
import { Text } from '../primitives/Text';
import { ThemedTextInput } from '../primitives/ThemedTextInput';
import { withAlpha } from '../theme/color';
import { useInsets } from '../theme/insets';
import { airy } from '../theme/metrics';
import type { Status } from '../theme/status';
import { makeStyles, useTheme } from '../theme/theme';
import { type AgentBarLabels, defaultAgentBarLabels } from './agentBarLabels';
import { AGENT_SECTIONS, type DrawerItem, type DrawerWorkspace } from './sessionDrawerModel';

export type { DrawerItem, DrawerWorkspace } from './sessionDrawerModel';

const DRAWER_WIDTH = 330;
/** Left padding of a tab row: its icon sits under the Workspace title, not the chevron. */
const ROW_INDENT = 30;

const useStyles = makeStyles((t) => ({
  scrim: { flex: 1, flexDirection: 'row', backgroundColor: t.backdrop },
  drawer: {
    width: DRAWER_WIDTH,
    maxWidth: '88%',
    backgroundColor: t.colors.surfaceRaised,
    borderTopRightRadius: 24,
    borderBottomRightRadius: 24,
    borderWidth: t.metrics.hairlineWidth,
    borderColor: t.hairline,
    paddingTop: t.spacing.sm,
    paddingBottom: t.spacing.md,
    overflow: 'hidden',
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xxs,
    paddingHorizontal: airy.stack + 4,
  },
  search: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xxs,
    height: t.metrics.minTapSize,
    paddingHorizontal: airy.stack + 4,
    borderRadius: 999,
    backgroundColor: t.colors.control,
  },
  input: { flex: 1, color: t.colors.textPrimary, fontSize: 14, padding: 0, minWidth: 0 },
  toggles: {
    flexDirection: 'row',
    borderRadius: 999,
    backgroundColor: t.colors.control,
    padding: 3,
  },
  toggle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  host: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xxs,
    paddingHorizontal: t.spacing.sm,
    paddingTop: t.spacing.md,
  },
  hostText: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: t.spacing.xxs,
    flexShrink: 1,
  },
  hostName: { flexShrink: 0 },
  plus: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  groupLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xs,
    paddingHorizontal: t.spacing.md,
    paddingTop: t.spacing.md,
    paddingBottom: t.spacing.xxs,
  },
  count: {
    backgroundColor: t.colors.control,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 1,
  },
  group: { paddingTop: t.spacing.xxs },
  groupHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xs,
    paddingHorizontal: t.spacing.md,
    height: 48,
  },
  groupTitle: { flex: 1 },
  branch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: -t.spacing.xxs - 2,
    paddingLeft: t.spacing.md + 14 + t.spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xs,
    marginHorizontal: airy.stack,
    paddingLeft: ROW_INDENT,
    paddingRight: t.spacing.sm,
    height: 50,
    borderRadius: t.metrics.cardRadius + 4,
  },
  rowTitle: { flex: 1 },
  lead: { width: 24, alignItems: 'center' },
  flex: { flex: 1 },
}));

export interface SessionDrawerProps {
  /** "Studio Mac" and the counts line "3 Agents · 2 shells". */
  host: { name: string; summary: string; status?: Status };
  workspaces: readonly DrawerWorkspace[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onAdd?: () => void;
  /** Present: the drawer floats in a Modal over a dimmed detail; tapping the scrim closes it. */
  onClose?: () => void;
  visible?: boolean;
  labels?: AgentBarLabels;
  testID?: string;
}

const matches = (needle: string, ...hay: (string | undefined)[]) =>
  hay.some((text) => text?.toLowerCase().includes(needle));

/** The left drawer: search, Host line, Workspaces folded with their tabs and panes. */
export function SessionDrawer({
  host,
  workspaces,
  selectedId,
  onSelect,
  onAdd,
  onClose,
  visible = true,
  labels = defaultAgentBarLabels,
  testID = 'session-drawer',
}: SessionDrawerProps) {
  const styles = useStyles();
  const insets = useInsets();
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'tree' | 'agents'>('tree');
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  const needle = query.trim().toLowerCase();
  const shown = workspaces
    .map((ws) => ({
      ...ws,
      items:
        !needle || matches(needle, ws.title, ws.branch)
          ? ws.items
          : ws.items.filter((item) => matches(needle, item.title, item.program)),
    }))
    .filter((ws) => !needle || ws.items.length > 0);
  const toggle = (id: string) =>
    setFolded((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const renderRow = (item: DrawerItem) => {
    const selected = item.id === selectedId;
    return (
      <Pressable
        key={item.id}
        onPress={() => onSelect(item.id)}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={item.title}
        testID={`${testID}-row-${item.id}`}
        style={[styles.row, selected && { backgroundColor: withAlpha(theme.colors.accent, 0.25) }]}
      >
        <View style={styles.lead}>
          {item.kind === 'agent' ? (
            <ProgramMark
              program={item.program ?? ''}
              status={item.status}
              size={22}
              surface="surfaceRaised"
            />
          ) : (
            <Icon name="terminal" size={18} />
          )}
        </View>
        <Text variant="body" style={styles.rowTitle} numberOfLines={1}>
          {item.title}
        </Text>
        {item.age ? (
          <Text variant="footnote" tone="secondary" tabularNums>
            {item.age}
          </Text>
        ) : null}
      </Pressable>
    );
  };
  const agentSections = AGENT_SECTIONS.map(({ key, pick }) => ({
    key,
    title: labels[key],
    items: shown.flatMap((ws) => ws.items).filter(pick),
  })).filter((section) => section.items.length > 0);
  const panel = (
    <View
      style={[
        styles.drawer,
        // The drawer is a window over the screen: it keeps clear of the notch and the home indicator.
        {
          paddingTop: insets.top + theme.spacing.sm,
          paddingBottom: insets.bottom + theme.spacing.md,
        },
      ]}
      testID={testID}
    >
      <View style={styles.top}>
        <View style={styles.search}>
          <Icon name="search" size={16} />
          <ThemedTextInput
            value={query}
            onChangeText={setQuery}
            placeholder={labels.searchPlaceholder}
            accessibilityLabel={labels.search}
            style={styles.input}
            testID={`${testID}-search`}
          />
        </View>
        <View style={styles.toggles}>
          {(['tree', 'agents'] as const).map((mode) => {
            const active = view === mode;
            return (
              <Pressable
                key={mode}
                style={[
                  styles.toggle,
                  active && { backgroundColor: withAlpha(theme.colors.accent, 0.25) },
                ]}
                onPress={() => setView(mode)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={mode === 'tree' ? labels.workspaces : labels.switcher}
                testID={`${testID}-view-${mode}`}
              >
                <Icon
                  name={mode === 'tree' ? 'list' : 'people'}
                  size={18}
                  tint={active ? theme.colors.accent : undefined}
                />
              </Pressable>
            );
          })}
        </View>
      </View>
      <View style={styles.host}>
        {host.status ? <StatusDot status={host.status} /> : null}
        <View style={styles.hostText}>
          <Text variant="headline" monospaced style={styles.hostName}>
            {host.name}
          </Text>
          <Text variant="caption" tone="secondary" numberOfLines={1}>
            {host.summary}
          </Text>
        </View>
        {onAdd ? (
          <Pressable
            style={styles.plus}
            onPress={onAdd}
            accessibilityRole="button"
            accessibilityLabel={labels.newItem}
            testID={`${testID}-add`}
          >
            <Icon name="add" size={20} color="textPrimary" />
          </Pressable>
        ) : null}
      </View>
      {view === 'agents' ? (
        agentSections.map((section) => (
          <View key={section.key} testID={`${testID}-agents-${section.key}`}>
            <View style={styles.groupLabel}>
              <Text variant="subheadline" tone="secondary" semibold>
                {section.title}
              </Text>
              <View style={styles.count}>
                <Text variant="caption2" tone="secondary" tabularNums>
                  {String(section.items.length)}
                </Text>
              </View>
            </View>
            {section.items.map(renderRow)}
          </View>
        ))
      ) : (
        <>
          <View style={styles.groupLabel}>
            <Text variant="subheadline" tone="secondary" semibold>
              {labels.workspaces}
            </Text>
            <View style={styles.count}>
              <Text variant="caption2" tone="secondary" tabularNums>
                {String(shown.length)}
              </Text>
            </View>
          </View>
          {shown.map((ws) => {
            const open = !folded.has(ws.id) || Boolean(needle);
            return (
              <View key={ws.id} style={styles.group}>
                <Pressable
                  style={styles.groupHead}
                  onPress={() => toggle(ws.id)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: open }}
                  accessibilityLabel={ws.title}
                  testID={`${testID}-fold-${ws.id}`}
                >
                  <Icon name={open ? 'chevronDown' : 'chevronRight'} size={14} />
                  <Text variant="headline" style={styles.groupTitle} numberOfLines={1}>
                    {ws.title}
                  </Text>
                  <Text variant="footnote" tone="secondary" tabularNums>
                    {String(ws.items.length)}
                  </Text>
                </Pressable>
                {open && ws.branch ? (
                  <View style={styles.branch}>
                    <Icon name="branch" size={12} />
                    <Text variant="caption" tone="secondary" monospaced numberOfLines={1}>
                      {ws.branch}
                    </Text>
                  </View>
                ) : null}
                {open
                  ? ws.items.map((item) => {
                      return renderRow(item);
                    })
                  : null}
              </View>
            );
          })}
        </>
      )}
    </View>
  );
  if (!onClose) return panel;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.scrim}>
        {panel}
        <Pressable
          style={styles.flex}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={labels.sidebar}
          testID={`${testID}-scrim`}
        />
      </View>
    </Modal>
  );
}
