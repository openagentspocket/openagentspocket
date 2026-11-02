import {
  type SnippetStore,
  snippetDisplaySubtitle,
  snippetDisplayTitle,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Banner, Button, EmptyState, ListRow, TextField } from '@openagentspocket/ui';
import { useState } from 'react';
import { View } from 'react-native';
import { useSnippets } from './snippetStore';

interface SnippetsPaneProps {
  store: SnippetStore;
  /** Inserts the text into the draft or terminal, never submits it (ADR 0009). */
  onInsert: (text: string) => void;
  onManage: () => void;
}

/** snippets-pane: search, tap a Snippet to insert it; sending stays the user's Enter. */
export function SnippetsPane({ store, onInsert, onManage }: SnippetsPaneProps) {
  const all = useSnippets(store);
  const [query, setQuery] = useState('');
  // Reading `all` first subscribes the pane; `matching` filters the same catalog.
  const shown = all.length === 0 ? all : store.matching(query);

  if (store.catalogLoadError) {
    return (
      <EmptyState
        layout="compact"
        icon="warning"
        title={t('Snippets Unavailable')}
        message={t('The saved Snippets could not be read, so nothing was changed.')}
        testID="snippets-unavailable"
      />
    );
  }
  if (all.length === 0) {
    return (
      <EmptyState
        layout="compact"
        title={t('No Snippets yet')}
        actions={
          <Button title={t('Manage Snippets')} onPress={onManage} testID="snippets-manage" />
        }
        testID="snippets-empty"
      />
    );
  }
  return (
    <View testID="snippets-pane">
      <TextField
        label={t('Search Snippets')}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
        testID="snippets-search"
      />
      {shown.length === 0 ? (
        <Banner title={t('No Snippets')} tone="neutral" />
      ) : (
        shown.map((snippet) => (
          <ListRow
            key={snippet.id}
            title={snippetDisplayTitle(snippet)}
            subtitle={snippetDisplaySubtitle(snippet)}
            accessibilityHint={t('Inserts this Snippet without sending it')}
            onPress={() => onInsert(snippet.body)}
            testID={`snippet-${snippet.id}`}
          />
        ))
      )}
      <Button
        title={t('Manage Snippets…')}
        kind="text"
        onPress={onManage}
        testID="snippets-manage"
      />
    </View>
  );
}
