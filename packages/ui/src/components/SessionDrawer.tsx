import { useState } from 'react';
import { Modal, Pressable, TextInput, View } from 'react-native';
import { Icon } from '../primitives/Icon';
import { ProgramMark } from '../primitives/ProgramMark';
import { StatusDot } from '../primitives/StatusDot';
import { Text } from '../primitives/Text';
import { withAlpha } from '../theme/color';
import { airy } from '../theme/metrics';
import type { Status } from '../theme/status';
import { makeStyles, useTheme } from '../theme/theme';
import { type AgentBarLabels, defaultAgentBarLabels } from './agentBarLabels';

const DRAWER_WIDTH = 330;

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
  group: { paddingTop: t.spacing.xs },
  groupHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xs,
    paddingHorizontal: t.spacing.md,
    minHeight: t.metrics.minTapSize,
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
    paddingHorizontal: t.spacing.sm,
    minHeight: t.metrics.rowMinHeight,
    borderRadius: t.metrics.cardRadius + 4,
  },
  rowTitle: { flex: 1 },
  lead: { width: 24, alignItems: 'center' },
  flex: { flex: 1 },
}));

export interface DrawerItem {
  id: string;
  kind: 'agent' | 'shell';
  title: string;
  /** Required for an agent (draws its mark). */
  program?: string;
  /** "7m". */
  age?: string;
  status?: Status;
}

export interface DrawerWorkspace {
  id: string;
  title: string;
  branch?: string;
  items: readonly DrawerItem[];
}

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
  const theme = useTheme();
  const [query, setQuery] = useState('');
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
  const panel = (
    <View style={styles.drawer} testID={testID}>
      <View style={styles.top}>
        <View style={styles.search}>
          <Icon name="search" size={16} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={labels.searchPlaceholder}
            placeholderTextColor={theme.colors.textTertiary}
            selectionColor={theme.colors.accent}
            keyboardAppearance={theme.appearance}
            accessibilityLabel={labels.search}
            style={styles.input}
            testID={`${testID}-search`}
          />
        </View>
        <View style={styles.toggles}>
          <View style={[styles.toggle, { backgroundColor: withAlpha(theme.colors.accent, 0.25) }]}>
            <Icon name="list" size={18} tint={theme.colors.accent} />
          </View>
          <View style={styles.toggle}>
            <Icon name="people" size={18} />
          </View>
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
                  const selected = item.id === selectedId;
                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => onSelect(item.id)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={item.title}
                      testID={`${testID}-row-${item.id}`}
                      style={[
                        styles.row,
                        selected && { backgroundColor: withAlpha(theme.colors.accent, 0.25) },
                      ]}
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
                })
              : null}
          </View>
        );
      })}
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
