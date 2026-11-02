import { agentKind, type StatusInboxItem } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import {
  Card,
  Chip,
  ChipRow,
  makeStyles,
  ProgramMark,
  type Status,
  Text,
} from '@openagentspocket/ui';
import { View } from 'react-native';
import { ageSpoken, ageText, inboxAge } from './inboxAge';

const useStyles = makeStyles((th) => ({
  header: { flexDirection: 'row', alignItems: 'center', gap: th.spacing.xs },
  title: { flex: 1 },
}));

function statusOf(section: StatusInboxItem['section']): Status {
  switch (section) {
    case 'needsYou':
      return 'blocked';
    case 'working':
      return 'working';
    case 'doneRecent':
      return 'done';
    default:
      return 'idle';
  }
}

interface InboxCardProps {
  item: StatusInboxItem;
  now: number;
  onOpen?: (item: StatusInboxItem) => void;
}

/** One Agent in the Status Inbox: program mark, title, what it asks, chips and the status age. */
export function InboxCard({ item, now, onOpen }: InboxCardProps) {
  const styles = useStyles();
  const age = item.since === undefined ? undefined : inboxAge(item.since, now, item.isApproximate);
  const title = item.titleQualifier ? `${item.title} · ${item.titleQualifier}` : item.title;
  const chips = item.chips.map((chip) => chip.text);
  const label = [
    agentKind(item.row.agent),
    title,
    item.detail,
    chips.length > 0 ? t('On %@', chips.join(', ')) : undefined,
    age ? ageSpoken(age, item.section) : undefined,
  ]
    .filter((part): part is string => Boolean(part))
    .join('. ');
  return (
    <Card
      testID={`inbox-${item.row.agent.pane_id}`}
      accessibilityLabel={label}
      onPress={onOpen ? () => onOpen(item) : undefined}
      accent={item.section === 'needsYou' ? 'statusBlocked' : undefined}
    >
      <View style={styles.header}>
        <ProgramMark program={agentKind(item.row.agent)} status={statusOf(item.section)} />
        <Text variant="headline" style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {age ? (
          <Text variant="footnote" tone="secondary" testID={`age-${item.row.agent.pane_id}`}>
            {ageText(age)}
          </Text>
        ) : null}
      </View>
      {item.detail ? (
        <Text variant="body" tone="secondary" numberOfLines={3}>
          {item.detail}
        </Text>
      ) : null}
      {chips.length > 0 ? (
        <ChipRow>
          {chips.map((chip) => (
            <Chip key={chip} label={chip} />
          ))}
        </ChipRow>
      ) : null}
    </Card>
  );
}
