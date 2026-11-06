import { LIST_PRESENTATIONS, type ListPresentation } from '@openagentspocket/core';
import { type AppKey, t } from '@openagentspocket/i18n';
import {
  type ActionMenuItem,
  type IconName,
  ListToolbar,
  makeStyles,
  SearchBar,
  Text,
  type ListPresentation as ToolbarPresentation,
} from '@openagentspocket/ui';
import { View } from 'react-native';

const PRESENTATION_TITLES = {
  flat: 'All Agents',
  byHost: 'By Host',
  byWorkspace: 'By Workspace',
  byStatus: 'By Status',
} as const satisfies Record<ListPresentation, AppKey>;

const MENU_ICON = {
  flat: 'list',
  byHost: 'server',
  byWorkspace: 'folder',
  byStatus: 'statusWorking',
} as const satisfies Record<ListPresentation, IconName>;

const TOOLBAR_ICON: Record<ListPresentation, ToolbarPresentation> = {
  flat: 'flat',
  byHost: 'host',
  byWorkspace: 'workspace',
  byStatus: 'status',
};

const useStyles = makeStyles((theme) => ({
  bar: { marginHorizontal: -theme.metrics.screenInset },
  head: { gap: theme.spacing.xs },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingBottom: theme.spacing.xs,
  },
  searchField: { flex: 1 },
  closeCircle: {
    width: theme.metrics.minTapSize,
    height: theme.metrics.minTapSize,
    justifyContent: 'center',
  },
}));

interface AgentsToolbarProps {
  hostItems: readonly ActionMenuItem[];
  hostLabel: string;
  presentation: ListPresentation;
  onPresentation: (presentation: ListPresentation) => void;
  query: string;
  /** The search drawer starts tucked (as in Swift); a pull on the list reveals it. */
  searchOpen: boolean;
  onQuery: (query: string) => void;
  onHome: () => void;
  /** Leaves search mode and clears the query. */
  onCloseSearch: () => void;
  onNew: () => void;
  onBoard: () => void;
}

/** Home, the Host scope, the presentation and New capsule, the large title, then the search field once pulled down. */
export function AgentsToolbar(props: AgentsToolbarProps) {
  const styles = useStyles();
  const presentationItems: ActionMenuItem[] = [
    ...LIST_PRESENTATIONS.map((presentation) => ({
      key: presentation,
      title: t(PRESENTATION_TITLES[presentation]),
      icon: MENU_ICON[presentation],
      checked: props.presentation === presentation,
      onPress: () => props.onPresentation(presentation),
    })),
    { key: 'board', title: t('Board'), icon: 'pin', onPress: props.onBoard },
  ];
  if (props.searchOpen || props.query !== '') {
    // Search mode takes over the top of the list, as in Swift: field and a close circle, no title.
    return (
      <SearchBar
        label={t('Search Agents')}
        value={props.query}
        onChangeText={props.onQuery}
        onClose={props.onCloseSearch}
        closeLabel={t('Cancel')}
        clearLabel={t('Clear Filter')}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
        returnKeyType="search"
        testID="agents-search"
      />
    );
  }
  return (
    <>
      <View style={styles.bar}>
        <ListToolbar
          presentation={TOOLBAR_ICON[props.presentation]}
          presentationItems={presentationItems}
          hostItems={props.hostItems}
          hostLabel={props.hostLabel}
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
      </View>
    </>
  );
}
