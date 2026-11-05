import { t } from '@openagentspocket/i18n';
import {
  type ActionMenuItem,
  FoldHeader,
  ListToolbar,
  makeStyles,
  TerminalGroup,
  type TerminalModel,
  TerminalRow,
  Text,
} from '@openagentspocket/ui';
import { useState } from 'react';
import { View } from 'react-native';
import { AppScreen } from '@/navigation/AppScreen';

export interface TerminalsGroupModel {
  id: string;
  workspace: string;
  host: string;
  terminals: readonly TerminalModel[];
}

const useStyles = makeStyles((theme) => ({
  bar: { marginHorizontal: -theme.metrics.screenInset },
  groups: { gap: theme.spacing.xs },
}));

interface TerminalsListScreenProps {
  groups: readonly TerminalsGroupModel[];
  onHome: () => void;
  onNew: () => void;
  onOpen?: (terminalId: string) => void;
  onNewIn?: (groupId: string) => void;
}

/**
 * console.terminals-list: the shell terminals of each workspace as cards under a folding workspace
 * header. The groups come from the Console store (`groupTerminals`); the presentation menu has its
 * single entry until a By Host layout exists. Opening an existing shell is not wired: the shell
 * route only creates new ones.
 */
export function TerminalsListScreen(props: TerminalsListScreenProps) {
  const styles = useStyles();
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  const hosts = [...new Set(props.groups.map((group) => group.host))];
  const hostItems: ActionMenuItem[] =
    hosts.length > 1
      ? [
          { key: 'all', title: t('All Hosts'), checked: true, onPress: () => undefined },
          ...hosts.map((name) => ({ key: name, title: name, onPress: () => undefined })),
        ]
      : [];
  const toggle = (id: string) =>
    setFolded((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  return (
    <AppScreen testID="terminals-screen">
      <View style={styles.bar}>
        <ListToolbar
          presentation="workspace"
          presentationItems={[
            { key: 'workspace', title: t('By Workspace'), checked: true, onPress: () => undefined },
          ]}
          hostItems={hostItems}
          onHome={props.onHome}
          onNew={props.onNew}
          labels={{
            home: t('Home'),
            host: t('Filter by Host'),
            presentation: t('Presentation'),
            new: t('New Terminal'),
          }}
          testID="terminals-toolbar"
        />
      </View>
      <Text variant="title" accessibilityRole="header">
        {t('Terminals')}
      </Text>
      <View style={styles.groups}>
        {props.groups.map((group) => {
          const isFolded = folded.has(group.id);
          return (
            <View key={group.id}>
              <FoldHeader
                kind="status"
                title={group.workspace}
                subtitle={group.host}
                collapsed={isFolded}
                onToggle={() => toggle(group.id)}
                testID={`terminals-header-${group.id}`}
              />
              {isFolded ? null : (
                <TerminalGroup onNewTerminal={() => props.onNewIn?.(group.id)}>
                  {group.terminals.map((terminal, index) => (
                    <TerminalRow
                      // biome-ignore lint/suspicious/noArrayIndexKey: terminals have no id of their own
                      key={index}
                      terminal={terminal}
                      onPress={() => props.onOpen?.(`${group.id}:${index}`)}
                    />
                  ))}
                </TerminalGroup>
              )}
            </View>
          );
        })}
      </View>
    </AppScreen>
  );
}
