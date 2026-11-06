import { Fragment, useRef } from 'react';
import { PanResponder, View } from 'react-native';
import { impact } from '../haptics';
import type { KeySpec } from '../keys/KeyboardDock';
import { Icon, type IconName } from '../primitives/Icon';
import { Tappable } from '../primitives/Tappable';
import { Text } from '../primitives/Text';
import { makeStyles, useTheme } from '../theme/theme';
import { useKeyRepeat } from './keyRepeat';

export interface KeyPadPage {
  id: string;
  title: string;
  /** Rows of key caps, three per row. */
  keys: readonly KeySpec[];
}

export interface KeyPadTab {
  id: string;
  label: string;
  icon: IconName;
}

const PAD_COLUMNS = 3;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let at = 0; at < items.length; at += size) rows.push(items.slice(at, at + size));
  return rows;
}

/** Horizontal travel of a swipe that changes the page. */
export const PAGE_SWIPE = 40;

/** The page after a swipe of `dx`, or the same page when the swipe is short or at an edge. */
export function swipedPage(index: number, count: number, dx: number): number {
  if (dx <= -PAGE_SWIPE) return Math.min(count - 1, index + 1);
  if (dx >= PAGE_SWIPE) return Math.max(0, index - 1);
  return index;
}

/** The Agent page keys of the Swift pad: Esc Tab Backspace / arrows / Shift-Tab Down Enter. */
export const agentPadKeys: readonly KeySpec[] = [
  { id: 'esc', label: 'Esc', accessibilityLabel: 'Escape' },
  { id: 'tab', label: 'Tab' },
  { id: 'backspace', label: 'Backspace' },
  { id: 'left', label: '←', accessibilityLabel: 'Left arrow' },
  { id: 'up', label: '↑', accessibilityLabel: 'Up arrow' },
  { id: 'right', label: '→', accessibilityLabel: 'Right arrow' },
  { id: 'shift-tab', label: '⇧Tab', accessibilityLabel: 'Shift Tab' },
  { id: 'down', label: '↓', accessibilityLabel: 'Down arrow' },
  { id: 'enter', label: 'Enter' },
];

const useStyles = makeStyles((t) => ({
  pad: { gap: t.spacing.sm },
  pager: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 32,
  },
  pagerTitle: { flex: 1, alignItems: 'center' },
  dots: { flexDirection: 'row', gap: t.spacing.xxs },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: t.colors.textTertiary },
  dotOn: { backgroundColor: t.colors.accent },
  grid: { gap: t.spacing.xs },
  gridRow: { flexDirection: 'row', gap: t.spacing.xs },
  cap: {
    flex: 1,
    minHeight: 64,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.surfaceRaised,
    borderWidth: t.metrics.hairlineWidth,
    borderColor: t.hairline,
  },
  pressed: { opacity: 0.6 },
  tabs: { flexDirection: 'row', gap: t.spacing.xs },
  tab: {
    flex: 1,
    minHeight: t.metrics.minTapSize,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  tabOn: { backgroundColor: t.colors.accentContainer },
}));

function Cap({ spec, onKey }: { spec: KeySpec; onKey: (key: KeySpec) => void }) {
  const styles = useStyles();
  const repeat = useKeyRepeat(() => onKey(spec));
  return (
    <Tappable
      style={({ pressed }) => [styles.cap, pressed && styles.pressed]}
      onPressIn={() => {
        impact('light');
        repeat.start();
      }}
      onPressOut={repeat.stop}
      accessibilityRole="keyboardkey"
      accessibilityLabel={spec.accessibilityLabel ?? spec.label}
      testID={`keypad-key-${spec.id}`}
    >
      <Text variant="body" semibold>
        {spec.label}
      </Text>
    </Tappable>
  );
}

interface KeyPadProps {
  pages: readonly KeyPadPage[];
  page: string;
  onPageChange: (id: string) => void;
  onKey: (key: KeySpec, page: string) => void;
  /** The bottom page tab bar (keys, skills, snippets, appearance). */
  tabs?: readonly KeyPadTab[];
  tab?: string;
  onTabChange?: (id: string) => void;
  testID?: string;
}

/**
 * The key pad pane of the keyboard dock: an Agent / Terminal pager (swipe or tap a title) over a
 * 3-column grid of key caps that repeat on hold, and the page tab bar below.
 */
export function KeyPad({
  pages,
  page,
  onPageChange,
  onKey,
  tabs = [],
  tab,
  onTabChange,
  testID = 'keypad',
}: KeyPadProps) {
  const styles = useStyles();
  const theme = useTheme();
  const index = Math.max(
    0,
    pages.findIndex((entry) => entry.id === page),
  );
  const live = useRef({ index, count: pages.length, pages, onPageChange });
  live.current = { index, count: pages.length, pages, onPageChange };
  const swipe = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) =>
        Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderRelease: (_e, g) => {
        const { index: at, count, pages: all, onPageChange: change } = live.current;
        const next = swipedPage(at, count, g.dx);
        const target = all[next];
        if (next !== at && target) change(target.id);
      },
    }),
  ).current;
  const current = pages[index];
  return (
    <View style={styles.pad} testID={testID}>
      <View style={styles.pager} accessibilityRole="tablist">
        {pages.map((entry, at) => {
          const selected = at === index;
          return (
            <Fragment key={entry.id}>
              {at === 1 ? (
                <View style={styles.dots} testID="keypad-dots">
                  {pages.map((dot, dotAt) => (
                    <View key={dot.id} style={[styles.dot, dotAt === index && styles.dotOn]} />
                  ))}
                </View>
              ) : null}
              <Tappable
                style={styles.pagerTitle}
                onPress={() => onPageChange(entry.id)}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                accessibilityLabel={entry.title}
                testID={`keypad-page-${entry.id}`}
              >
                <Text
                  variant="subheadline"
                  semibold={selected}
                  tone={selected ? 'primary' : 'secondary'}
                >
                  {entry.title}
                </Text>
              </Tappable>
            </Fragment>
          );
        })}
      </View>
      <View style={styles.grid} {...swipe.panHandlers}>
        {chunk(current?.keys ?? [], PAD_COLUMNS).map((row) => (
          <View key={row.map((spec) => spec.id).join()} style={styles.gridRow}>
            {row.map((spec) => (
              <Cap key={spec.id} spec={spec} onKey={(key) => current && onKey(key, current.id)} />
            ))}
          </View>
        ))}
      </View>
      {tabs.length > 0 ? (
        <View style={styles.tabs} accessibilityRole="tablist">
          {tabs.map((entry) => {
            const selected = entry.id === tab;
            return (
              <Tappable
                key={entry.id}
                style={[styles.tab, selected && styles.tabOn]}
                onPress={() => onTabChange?.(entry.id)}
                accessibilityRole="tab"
                accessibilityLabel={entry.label}
                accessibilityState={{ selected }}
                testID={`keypad-tab-${entry.id}`}
              >
                <Icon
                  name={entry.icon}
                  size={20}
                  tint={selected ? theme.colors.accent : theme.colors.textSecondary}
                />
              </Tappable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
