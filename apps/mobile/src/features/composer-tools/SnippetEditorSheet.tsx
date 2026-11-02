import {
  makeSnippet,
  SNIPPET_BODY_CHARACTER_LIMIT,
  type Snippet,
  SnippetValidationFailure,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Button, Sheet, TextField } from '@openagentspocket/ui';
import { useEffect, useState } from 'react';

interface SnippetEditorSheetProps {
  visible: boolean;
  /** The Snippet being edited; absent for a new one. */
  snippet?: Snippet;
  /** Receives a valid Snippet; the owner stores it. */
  onSave: (snippet: Snippet) => void;
  onClose: () => void;
}

function validationMessage(failure: SnippetValidationFailure): string {
  switch (failure.error.kind) {
    case 'emptyBody':
      return t('A Snippet needs some text.');
    case 'bodyTooLong':
      return t('A Snippet can hold at most %lld characters.', failure.error.limit);
    default:
      return t('The Snippet could not be saved.');
  }
}

/** snippet-editor: an optional title and the text; validation happens here, where it can be fixed. */
export function SnippetEditorSheet({ visible, snippet, onSave, onClose }: SnippetEditorSheetProps) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (!visible) return;
    setTitle(snippet?.title ?? '');
    setBody(snippet?.body ?? '');
    setError(undefined);
  }, [visible, snippet]);

  const save = () => {
    try {
      onSave(makeSnippet({ id: snippet?.id, title, body }));
    } catch (thrown) {
      if (!(thrown instanceof SnippetValidationFailure)) throw thrown;
      setError(validationMessage(thrown));
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={snippet ? t('Edit Snippet') : t('New Snippet')}
      closeLabel={t('Close')}
      detent="large"
      footer={<Button title={t('Save')} onPress={save} testID="snippet-save" />}
      testID="snippet-editor"
    >
      <TextField
        label={t('Title')}
        hint={t("A short name. Leave it empty and the Snippet's own text is its name.")}
        value={title}
        onChangeText={setTitle}
        testID="snippet-title"
      />
      <TextField
        label={t('Text')}
        multiline
        maxLength={SNIPPET_BODY_CHARACTER_LIMIT + 1}
        value={body}
        onChangeText={(next) => {
          setBody(next);
          setError(undefined);
        }}
        error={error}
        testID="snippet-body"
      />
    </Sheet>
  );
}
