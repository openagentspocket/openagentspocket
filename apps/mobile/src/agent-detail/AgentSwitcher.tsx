import { agentDisplayName, type ConsoleRow, rowKey } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { makeStyles, ProgramMark, Text } from '@openagentspocket/ui';
import { Pressable, ScrollView } from 'react-native';
import { statusDot } from '@/console/agentStatus';

const useStyles = makeStyles((th) => ({
  strip: { gap: th.spacing.xs, paddingVertical: th.spacing.xxs },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.spacing.xxs,
    paddingHorizontal: th.spacing.xs,
    paddingVertical: th.spacing.xxs,
    borderRadius: th.metrics.chipRadius,
    backgroundColor: th.colors.control,
  },
  current: { backgroundColor: th.colors.accentContainer },
}));

interface Props {
  rows: readonly ConsoleRow[];
  currentKey: string;
  onSelect: (row: ConsoleRow) => void;
}

/** The Console's Agents in a strip, to hop between them without going back to the list. */
export function AgentSwitcher({ rows, currentKey, onSelect }: Props) {
  const styles = useStyles();
  if (rows.length < 2) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.strip}
      accessibilityLabel={t('Switch Agent')}
      testID="agent-switcher"
    >
      {rows.map((row) => {
        const key = rowKey(row);
        const current = key === currentKey;
        return (
          <Pressable
            key={key}
            accessibilityRole="button"
            accessibilityState={{ selected: current }}
            accessibilityLabel={agentDisplayName(row.agent)}
            accessibilityHint={t('Switches to that Agent')}
            onPress={() => onSelect(row)}
            style={[styles.item, current && styles.current]}
            testID={`switch-${row.agent.pane_id}`}
          >
            <ProgramMark
              program={row.agent.agent ?? 'unknown'}
              status={statusDot(row.agent.agent_status)}
              size={18}
            />
            <Text variant="caption" tone={current ? 'accent' : 'secondary'} numberOfLines={1}>
              {agentDisplayName(row.agent)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
