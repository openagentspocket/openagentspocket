import { agentDisplayName, type ConsoleRow } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Chip, ChipRow, makeStyles, ProgramMark, Text } from '@openagentspocket/ui';
import { View } from 'react-native';
import { statusDot } from '../home/AgentCard';
import type { Surface } from './surface';

const useStyles = makeStyles((th) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: th.spacing.xs },
  text: { flex: 1 },
}));

interface Props {
  row: ConsoleRow;
  surface: Surface;
  onSurface: (surface: Surface) => void;
}

/** Program mark with status, the Agent's name and place, and the Chat/Terminal toggle. */
export function AgentHeader({ row, surface, onSurface }: Props) {
  const styles = useStyles();
  const status = statusDot(row.agent.agent_status);
  const place = [row.hostName, row.workspaceLabel].filter(Boolean).join(' · ');
  return (
    <View testID="agent-header">
      <View style={styles.row}>
        <ProgramMark program={row.agent.agent ?? 'unknown'} status={status} size={28} />
        <View style={styles.text}>
          <Text variant="headline" numberOfLines={1}>
            {agentDisplayName(row.agent)}
          </Text>
          <Text variant="caption" tone="secondary" numberOfLines={1}>
            {place}
          </Text>
        </View>
      </View>
      <View accessibilityLabel={t('Agent view')}>
        <ChipRow>
          <Chip
            label={t('Chat')}
            mono={false}
            selected={surface === 'chat'}
            onPress={() => onSurface('chat')}
            testID="surface-chat"
          />
          <Chip
            label={t('Terminal')}
            mono={false}
            selected={surface === 'terminal'}
            onPress={() => onSurface('terminal')}
            testID="surface-terminal"
          />
        </ChipRow>
      </View>
    </View>
  );
}
