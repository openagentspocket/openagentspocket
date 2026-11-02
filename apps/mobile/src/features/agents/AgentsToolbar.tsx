import { LIST_PRESENTATIONS, type ListPresentation } from '@openagentspocket/core';
import { type AppKey, t } from '@openagentspocket/i18n';
import {
  type ActionMenuItem,
  ListToolbar,
  makeStyles,
  SearchField,
  Text,
  type ListPresentation as ToolbarPresentation,
} from '@openagentspocket/ui';
import { View } from 'react-native';
import type { HostSummary } from '../../console/store';

const PRESENTATION_TITLES = {
  flat: 'All Agents',
  byHost: 'By Host',
  byWorkspace: 'By Workspace',
  byStatus: 'By Status',
} as const satisfies Record<ListPresentation, AppKey>;

const TOOLBAR_ICON: Record<ListPresentation, ToolbarPresentation> = {
  flat: 'flat',
  byHost: 'host',
  byWorkspace: 'workspace',
  byStatus: 'status',
};

const useStyles = makeStyles((theme) => ({
  bar: { marginHorizontal: -theme.metrics.screenInset },
  head: { gap: theme.spacing.xs },
}));

interface AgentsToolbarProps {
  hosts: readonly HostSummary[];
  hostId: string | undefined;
  onHost: (hostId: string | undefined) => void;
  presentation: ListPresentation;
  onPresentation: (presentation: ListPresentation) => void;
  query: string;
  onQuery: (query: string) => void;
  onHome: () => void;
  onNew: () => void;
}

/** Home and the Host filter, presentation and New capsule, the large title, then the search field. */
export function AgentsToolbar(props: AgentsToolbarProps) {
  const styles = useStyles();
  const hostItems: ActionMenuItem[] =
    props.hosts.length > 1
      ? [
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
        ]
      : [];
  const presentationItems: ActionMenuItem[] = LIST_PRESENTATIONS.map((presentation) => ({
    key: presentation,
    title: t(PRESENTATION_TITLES[presentation]),
    checked: props.presentation === presentation,
    onPress: () => props.onPresentation(presentation),
  }));
  return (
    <>
      <View style={styles.bar}>
        <ListToolbar
          presentation={TOOLBAR_ICON[props.presentation]}
          presentationItems={presentationItems}
          hostItems={hostItems}
          onHome={props.onHome}
          onNew={props.onNew}
          labels={{
            home: t('Home'),
            host: t('Filter by Host'),
            presentation: t('Presentation'),
            new: t('New Agent'),
          }}
          testID="agents-toolbar"
        />
      </View>
      <View style={styles.head}>
        <Text variant="title" accessibilityRole="header">
          {t('Agents')}
        </Text>
        <SearchField
          label={t('Search Agents')}
          value={props.query}
          onChangeText={props.onQuery}
          clearLabel={t('Clear Filter')}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          testID="agents-search"
        />
      </View>
    </>
  );
}
