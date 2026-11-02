import type { AccountSuggestion } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Button, ListRow, Section } from '@openagentspocket/ui';

interface Props {
  suggestions: readonly AccountSuggestion[];
  busy: boolean;
  atLimit: boolean;
  onAdd: (suggestion: AccountSuggestion) => void;
  onIgnore: (directory: string) => void;
}

/** Directories the plugin found that could be Accounts: Add or Ignore each. */
export function AccountSuggestions({ suggestions, busy, atLimit, onAdd, onIgnore }: Props) {
  if (suggestions.length === 0) return null;
  return (
    <Section grouped title={t('Suggestions')}>
      {suggestions.map((s) => (
        <ListRow
          key={s.directory}
          title={s.name}
          subtitle={s.directory}
          trailing={
            <>
              <Button
                title={t('Add')}
                size="small"
                kind="secondary"
                disabled={busy || atLimit}
                onPress={() => onAdd(s)}
                testID={`suggestion-add-${s.name}`}
              />
              <Button
                title={t('Ignore')}
                size="small"
                kind="text"
                disabled={busy}
                onPress={() => onIgnore(s.directory)}
                testID={`suggestion-ignore-${s.name}`}
              />
            </>
          }
        />
      ))}
    </Section>
  );
}
