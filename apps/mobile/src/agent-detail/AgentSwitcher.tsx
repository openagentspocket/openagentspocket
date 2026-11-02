import { agentDisplayName, type ConsoleRow, rowKey } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { makeStyles, ProgramMark, Text } from '@openagentspocket/ui';
import { Pressable, ScrollView } from 'react-native';
import { statusDot } from '@/console/agentStatus';

const useStyles = makeStyles((th) => ({
  // Swift TerminalAgentSwitcher: one 40 pt row of chips inside the composer card.
  strip: { gap: th.spacing.xs, alignItems: 'center', paddingHorizontal: th.spacing.xxs },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.spacing.xxs,
    height: 32,
    paddingHorizontal: th.spacing.xs,
    borderRadius: 16,
  },
  current: { backgroundColor: th.colors.control },
}));

interface Props {
  rows: readonly ConsoleRow[];
  currentKey: string;
  onSelect: (row: ConsoleRow) => void;
}

/** The Console's Agents as compact chips, to hop between them without going back to the list. */
export function AgentSwitcher({ rows, currentKey, onSelect }: Props) {
  const styles = useStyles();
  if (rows.length < 2) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.strip}
      style={{ flexGrow: 0, height: 40 }}
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
            <Text variant="footnote" tone={current ? 'primary' : 'secondary'} numberOfLines={1}>
              {agentDisplayName(row.agent)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
