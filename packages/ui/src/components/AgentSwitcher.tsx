import { useRef } from 'react';
import { Pressable, ScrollView, type ScrollViewInstance, View } from 'react-native';
import { impact } from '../haptics';
import { GlassCapsule } from '../primitives/GlassCapsule';
import { Icon, type IconName } from '../primitives/Icon';
import { ProgramMark } from '../primitives/ProgramMark';
import { Text } from '../primitives/Text';
import { airy } from '../theme/metrics';
import type { Status } from '../theme/status';
import { makeStyles, useTheme } from '../theme/theme';
import { type AgentBarLabels, defaultAgentBarLabels } from './agentBarLabels';

const useStyles = makeStyles((t) => ({
  capsule: { marginHorizontal: t.spacing.sm, height: t.metrics.minTapSize, overflow: 'hidden' },
  scroll: { flex: 1 },
  content: { alignItems: 'center', paddingHorizontal: t.spacing.xxs, gap: t.spacing.xxs },
  chip: {
    height: 34,
    paddingHorizontal: t.spacing.sm,
    borderRadius: 999,
    justifyContent: 'center',
    maxWidth: 160,
  },
  neighbour: { opacity: 0.55 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xs,
    backgroundColor: t.colors.control,
    borderRadius: 999,
    height: 34,
    paddingHorizontal: airy.card,
  },
  trailing: { flexDirection: 'row', alignItems: 'center', paddingRight: t.spacing.xxs },
  toggle: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
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
  const centre = (x: number, width: number) => {
    scroll.current?.scrollTo({
      x: Math.max(0, x - (viewport.current - width) / 2),
      animated: false,
    });
  };
  return (
    <GlassCapsule style={styles.capsule} testID={testID}>
      <ScrollView
        ref={scroll}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        onLayout={(event) => {
          viewport.current = event.nativeEvent.layout.width;
        }}
        accessibilityLabel={labels.switcher}
      >
        {agents.map((agent) => {
          const current = agent.id === currentId;
          return (
            <Pressable
              key={agent.id}
              onLayout={(event) => {
                if (current) centre(event.nativeEvent.layout.x, event.nativeEvent.layout.width);
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
              style={current ? styles.pill : [styles.chip, styles.neighbour]}
            >
              {current ? (
                <ProgramMark
                  program={agent.program}
                  status={agent.status}
                  size={20}
                  surface="control"
                />
              ) : null}
              <Text
                variant="subheadline"
                semibold={current}
                numberOfLines={1}
                tone={current ? 'primary' : 'secondary'}
              >
                {agent.title}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={styles.trailing}>
        {trailing.map((item) => (
          <Pressable
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
              size={18}
              tint={item.active ? theme.colors.accent : theme.colors.textPrimary}
            />
          </Pressable>
        ))}
      </View>
    </GlassCapsule>
  );
}
