import {
  type Snippet,
  type SnippetStore,
  snippetDisplaySubtitle,
  snippetDisplayTitle,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Button, EmptyState, ListRow, toast } from '@openagentspocket/ui';
import { useState } from 'react';
import { AppScreen } from '@/navigation/AppScreen';
import { SnippetEditorSheet } from './SnippetEditorSheet';
import { useSnippets } from './snippetStore';

/** snippets-manager: add, edit, delete and reorder; the order is the user's, never re-sorted. */
export function SnippetsManager({ store }: { store: SnippetStore }) {
  const snippets = useSnippets(store);
  const [editing, setEditing] = useState<Snippet | 'new' | undefined>();

  const guarded = (change: () => void) => {
    try {
      change();
    } catch {
      toast({ title: t('The Snippet could not be saved.') });
    }
  };
  const save = (snippet: Snippet) =>
    guarded(() => {
      if (editing === 'new') store.add(snippet);
      else store.update(snippet);
      setEditing(undefined);
    });

  return (
    <AppScreen header={{ variant: 'native', title: t('Snippets') }} testID="snippets-manager">
      {snippets.length === 0 ? (
        <EmptyState layout="compact" title={t('No Snippets yet')} />
      ) : (
        snippets.map((snippet, index) => (
          <ListRow
            key={snippet.id}
            title={snippetDisplayTitle(snippet)}
            subtitle={snippetDisplaySubtitle(snippet)}
            onPress={() => setEditing(snippet)}
            swipeActions={[
              {
                key: 'delete',
                title: t('Delete'),
                icon: 'trash',
                tone: 'danger',
                onPress: () => guarded(() => store.remove(snippet.id)),
              },
            ]}
            menu={[
              ...(index > 0
                ? [
                    {
                      key: 'up',
                      title: t('Move up'),
                      onPress: () => guarded(() => store.move(index, index - 1)),
                    },
                  ]
                : []),
              ...(index < snippets.length - 1
                ? [
                    {
                      key: 'down',
                      title: t('Move down'),
                      onPress: () => guarded(() => store.move(index, index + 2)),
                    },
                  ]
                : []),
            ]}
            testID={`manage-snippet-${snippet.id}`}
          />
        ))
      )}
      <Button
        title={t('New Snippet')}
        icon="add"
        onPress={() => setEditing('new')}
        testID="snippet-new"
      />
      <SnippetEditorSheet
        visible={editing !== undefined}
        snippet={editing === 'new' ? undefined : editing}
        onSave={save}
        onClose={() => setEditing(undefined)}
      />
    </AppScreen>
  );
}
