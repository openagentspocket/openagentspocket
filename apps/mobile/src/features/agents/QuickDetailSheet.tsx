import {
  agentKindLabel,
  type ConsoleRow,
  inboxTitle,
  rowDirectory,
  rowKey,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import {
  type AgentRowLabels,
  Button,
  Chip,
  KeyValueGroup,
  type KeyValueRow,
  makeStyles,
  ProgramMark,
  QuickSheetHeader,
  Sheet,
  Text,
} from '@openagentspocket/ui';
import { View } from 'react-native';
import { statusDot } from '../../console/agentStatus';
import { useConsoleStore } from '../../console/hooks';
import { ageText, inboxAge } from '../../home/inboxAge';

const useStyles = makeStyles((theme) => ({
  pair: { flexDirection: 'row', gap: theme.spacing.xs },
  fill: { flex: 1 },
}));

interface QuickDetailSheetProps {
  row: ConsoleRow | undefined;
  pinned: boolean;
  labels: AgentRowLabels;
  onClose: () => void;
  onOpen: (row: ConsoleRow) => void;
  onTogglePin: (row: ConsoleRow) => void;
  onCloseAgent: (row: ConsoleRow) => void;
}

/** The medium quick detail of an Agent: kind, status and age, title, chips, copyable ids, actions. */
export function QuickDetailSheet({
  row,
  pinned,
  labels,
  onClose,
  onOpen,
  onTogglePin,
  onCloseAgent,
}: QuickDetailSheetProps) {
  const styles = useStyles();
  const store = useConsoleStore();
  if (row === undefined) return null;
  const status = statusDot(row.agent.agent_status);
  const since = store.stamp(rowKey(row))?.since;
  const age = since === undefined ? undefined : ageText(inboxAge(since, Date.now(), false));
  const program = row.agent.agent ?? 'unknown';
  const session = row.agent.agent_session?.value;
  const details: KeyValueRow[] = [
    ...(row.workspaceLabel ? [{ label: t('Workspace'), value: row.workspaceLabel }] : []),
    ...(rowDirectory(row)
      ? [{ label: t('Directory'), value: rowDirectory(row) ?? '', mono: true }]
      : []),
    { label: t('Host'), value: row.hostName },
    ...(session ? [{ label: t('Session'), value: session, mono: true, copy: true }] : []),
    { label: t('Pane id'), value: row.agent.pane_id, mono: true, copy: true },
  ];
  const chips = [row.hostName, row.workspaceLabel].filter((chip): chip is string => Boolean(chip));
  return (
    <Sheet
      visible
      onClose={onClose}
      detent="fit"
      floating
      closeButton={false}
      testID="quick-detail"
      footer={
        <>
          <View style={styles.pair}>
            <View style={styles.fill}>
              <Button
                size="dense"
                icon="bot"
                title={t('Open Chat')}
                onPress={() => onOpen(row)}
                testID="quick-open-chat"
              />
            </View>
            <View style={styles.fill}>
              <Button
                size="dense"
                icon="terminal"
                title={t('Open Terminal')}
                onPress={() => onOpen(row)}
                testID="quick-open-terminal"
              />
            </View>
          </View>
          <View style={styles.pair}>
            <View style={styles.fill}>
              <Button
                size="dense"
                kind="secondary"
                icon="pin"
                title={pinned ? labels.unpin : labels.pin}
                onPress={() => onTogglePin(row)}
              />
            </View>
            <View style={styles.fill}>
              <Button
                size="dense"
                kind="destructive"
                icon="close"
                title={labels.close}
                onPress={() => onCloseAgent(row)}
              />
            </View>
          </View>
        </>
      }
    >
      <QuickSheetHeader
        grabber={false}
        title={inboxTitle(row)}
        onClose={onClose}
        eyebrow={
          <>
            <ProgramMark program={program} status={status} />
            <Text variant="callout" tone="secondary">
              {`${agentKindLabel(program)} · ${labels.status[status]}`}
            </Text>
          </>
        }
        eyebrowTrailing={age}
        chips={chips.map((chip) => <Chip key={chip} label={chip} />)}
      />
      <KeyValueGroup compact rows={details} />
    </Sheet>
  );
}
