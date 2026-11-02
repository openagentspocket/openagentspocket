import { LIST_PRESENTATIONS, type ListPresentation } from '@openagentspocket/core';
import { type AppKey, t } from '@openagentspocket/i18n';
import { ActionMenuButton, type ActionMenuItem, makeStyles, TextField } from '@openagentspocket/ui';
import { View } from 'react-native';
import type { HostSummary } from '../../console/store';

const PRESENTATION_TITLES = {
  flat: 'All Agents',
  byHost: 'By Host',
  byWorkspace: 'By Workspace',
  byStatus: 'By Status',
} as const satisfies Record<ListPresentation, AppKey>;

const useStyles = makeStyles((theme) => ({
  bar: { flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing.xs },
  search: { flex: 1 },
}));

interface AgentsToolbarProps {
  hosts: readonly HostSummary[];
  hostId: string | undefined;
  onHost: (hostId: string | undefined) => void;
  presentation: ListPresentation;
  onPresentation: (presentation: ListPresentation) => void;
  query: string;
  onQuery: (query: string) => void;
}

/** Search beside the Host filter and the presentation picker. */
export function AgentsToolbar(props: AgentsToolbarProps) {
  const styles = useStyles();
  const hostItems: ActionMenuItem[] = [
    {
      key: 'all',
      title: t('All Hosts'),
      checked: props.hostId === undefined,
      onPress: () => props.onHost(undefined),
    },
    ...props.hosts.map((host) => ({
      key: host.id,
      title: host.name,
      checked: props.hostId === host.id,
      onPress: () => props.onHost(host.id),
    })),
  ];
  const presentationItems: ActionMenuItem[] = LIST_PRESENTATIONS.map((presentation) => ({
    key: presentation,
    title: t(PRESENTATION_TITLES[presentation]),
    checked: props.presentation === presentation,
    onPress: () => props.onPresentation(presentation),
  }));
  return (
    <View style={styles.bar}>
      <View style={styles.search}>
        <TextField
          label={t('Search Agents')}
          value={props.query}
          onChangeText={props.onQuery}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          testID="agents-search"
        />
      </View>
      <ActionMenuButton
        items={hostItems}
        title={t('Filter by Host')}
        accessibilityLabel={t('Filter by Host')}
        icon="server"
        testID="host-filter"
      />
      <ActionMenuButton
        items={presentationItems}
        title={t('Presentation')}
        accessibilityLabel={t('Presentation')}
        icon="chevronUpDown"
        testID="presentation-menu"
      />
    </View>
  );
}
