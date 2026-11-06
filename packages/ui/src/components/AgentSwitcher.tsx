import { useEffect, useRef, useState } from 'react';
import { ScrollView, type ScrollViewInstance, View } from 'react-native';
import { impact } from '../haptics';
import { GlassCapsule } from '../primitives/GlassCapsule';
import { Icon, type IconName } from '../primitives/Icon';
import { ProgramMark } from '../primitives/ProgramMark';
import { Tappable } from '../primitives/Tappable';
import { Text } from '../primitives/Text';
import { airy, spacing } from '../theme/metrics';
import type { Status } from '../theme/status';
import { makeStyles, useTheme } from '../theme/theme';
import { type AgentBarLabels, defaultAgentBarLabels } from './agentBarLabels';

/** Gap between chips, also the content inset used when aligning the scroll origin. */
const CHIP_GAP = spacing.xxs;
const COMPACT_CHIP = 40;
/** A neighbour clipped by the left edge stays readable only while this much of it shows. */
const MIN_VISIBLE = 48;

const useStyles = makeStyles((t) => ({
  capsule: { marginHorizontal: t.spacing.xs + 2, height: 52, overflow: 'hidden' },
  scroll: { flex: 1 },
  content: { alignItems: 'center', paddingHorizontal: t.spacing.xxs, gap: t.spacing.xxs },
  chip: {
    height: 40,
    paddingHorizontal: t.spacing.xs,
    borderRadius: 999,
    justifyContent: 'center',
    flexShrink: 0,
  },
  neighbour: { opacity: 0.7, flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs },
  /** Mark-only chip: a full circle, used when the neighbour's label cannot fit beside the pill. */
  neighbourCompact: { width: COMPACT_CHIP, paddingHorizontal: 0, alignItems: 'center' },
  hidden: { opacity: 0 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: airy.stack,
    backgroundColor: t.colors.control,
    borderRadius: 999,
    height: 40,
    paddingHorizontal: airy.stack + 2,
  },
  trailing: { flexDirection: 'row', alignItems: 'center', paddingRight: t.spacing.xxs },
  toggle: { width: 34, height: 44, alignItems: 'center', justifyContent: 'center' },
}));

export interface SwitcherAgent {
  id: string;
  title: string;
  program: string;
  status: Status;
}

export interface SwitcherTrailing {
  key: string;
  icon: IconName;
  label: string;
  onPress: () => void;
  active?: boolean;
}

export interface AgentSwitcherProps {
  agents: readonly SwitcherAgent[];
  currentId: string;
  onSelect: (id: string) => void;
  /** Surface and keyboard toggles; `tools` variants add compose and skills. */
  trailing?: readonly SwitcherTrailing[];
  labels?: Pick<AgentBarLabels, 'switcher' | 'switchTo'>;
  testID?: string;
}

/** The bottom glass capsule: neighbours faded, the current Agent a filled pill, trailing toggles. */
export function AgentSwitcher({
  agents,
  currentId,
  onSelect,
  trailing = [],
  labels = defaultAgentBarLabels,
  testID = 'agent-switcher',
}: AgentSwitcherProps) {
  const styles = useStyles();
  const theme = useTheme();
  const scroll = useRef<ScrollViewInstance>(null);
  const viewport = useRef(0);
  const currentBox = useRef<{ x: number; width: number } | null>(null);
  const previousBox = useRef<{ x: number; width: number } | null>(null);
  /** Width of the previous chip with its label, captured while it is still shown in full. */
  const previousFull = useRef(0);
  const [compact, setCompact] = useState(false);
  /** Scroll offset plus a layout tick, so a chip cut by the capsule edge can be hidden whole. */
  const [scrollX, setScrollX] = useState(0);
  const [, setTick] = useState(0);
  const boxes = useRef<Record<string, { x: number; width: number }>>({});
  const partlyShown = (id: string) => {
    const box = boxes.current[id];
    if (!box || viewport.current === 0) return false;
    const left = box.x - scrollX;
    const right = left + box.width;
    const cutLeft = left < -0.5 && right > 0.5;
    const cutRight = right > viewport.current + 0.5 && left < viewport.current - 0.5;
    // Swift clips the previous Agent at the capsule's left edge; keep that while enough of it
    // reads, and never draw a sliver or a chip cut on the right.
    return cutRight || (cutLeft && right < MIN_VISIBLE);
  };
  const currentIndex = agents.findIndex((agent) => agent.id === currentId);
  /** Whole or left-clipped previous chip while MIN_VISIBLE of it shows beside the pill, else mark-only. */
  const decide = () => {
    const box = currentBox.current;
    if (!box || viewport.current === 0 || previousFull.current === 0) return;
    setCompact(viewport.current - box.width - CHIP_GAP < MIN_VISIBLE);
  };
  /** Scrolls so the previous chip starts at the left edge, once boxes and viewport are measured. */
  const align = () => {
    const box = currentBox.current;
    if (!box || viewport.current === 0) return;
    // A change of width fires onLayout, a mere move does not: once the chips are mark-only the
    // positions follow from their fixed size rather than from a stale measure.
    const boxX = compact ? CHIP_GAP + currentIndex * (COMPACT_CHIP + CHIP_GAP) : box.x;
    const previousX = compact ? boxX - COMPACT_CHIP - CHIP_GAP : previousBox.current?.x;
    const start = previousX === undefined ? boxX : previousX - CHIP_GAP;
    const x = Math.max(0, start, boxX + box.width - viewport.current);
    scroll.current?.scrollTo({ x, animated: false });
    setScrollX(x);
  };
  const centre = () => {
    align();
    decide();
  };
  // Switching to mark-only chips moves the pill; align again once that layout has landed.
  // biome-ignore lint/correctness/useExhaustiveDependencies: align reads refs only
  useEffect(() => {
    const frame = requestAnimationFrame(align);
    return () => cancelAnimationFrame(frame);
  }, [compact]);
  return (
    <GlassCapsule style={styles.capsule} testID={testID}>
      <ScrollView
        ref={scroll}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        scrollEventThrottle={16}
        onScroll={(event) => setScrollX(event.nativeEvent.contentOffset.x)}
        onLayout={(event) => {
          viewport.current = event.nativeEvent.layout.width;
          centre();
        }}
        accessibilityLabel={labels.switcher}
      >
        {agents.map((agent, index) => {
          const current = agent.id === currentId;
          const shrink = compact && !current;
          return (
            <Tappable
              key={agent.id}
              onLayout={(event) => {
                const layout = event.nativeEvent.layout;
                boxes.current[agent.id] = layout;
                setTick((n) => n + 1);
                if (index === currentIndex - 1) {
                  previousBox.current = layout;
                  if (!compact) previousFull.current = layout.width;
                }
                if (current) currentBox.current = layout;
                if (current || index === currentIndex - 1) centre();
              }}
              onPress={() => {
                if (current) return;
                impact('light');
                onSelect(agent.id);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: current }}
              accessibilityLabel={current ? agent.title : `${labels.switchTo} ${agent.title}`}
              testID={`${testID}-${agent.id}`}
              style={
                current
                  ? styles.pill
                  : [
                      styles.chip,
                      styles.neighbour,
                      shrink && styles.neighbourCompact,
                      partlyShown(agent.id) && styles.hidden,
                    ]
              }
            >
              <ProgramMark
                program={agent.program}
                status={agent.status}
                pulse
                size={26}
                surface={current ? 'control' : 'surfaceRaised'}
              />
              {shrink ? null : (
                <Text
                  variant="body"
                  semibold={current}
                  numberOfLines={1}
                  tone={current ? 'primary' : 'secondary'}
                >
                  {agent.title}
                </Text>
              )}
            </Tappable>
          );
        })}
      </ScrollView>
      <View style={styles.trailing}>
        {trailing.map((item) => (
          <Tappable
            key={item.key}
            style={styles.toggle}
            onPress={item.onPress}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: Boolean(item.active) }}
            testID={`${testID}-${item.key}`}
          >
            <Icon
              name={item.icon}
              size={24}
              tint={item.active ? theme.colors.accent : theme.colors.textPrimary}
            />
          </Tappable>
        ))}
      </View>
    </GlassCapsule>
  );
}
