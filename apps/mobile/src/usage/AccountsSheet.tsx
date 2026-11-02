import {
  ACCOUNT_LIMIT,
  type AccountFileStore,
  accountStateLine,
  claudeProgram,
  comparablePath,
  DEFAULT_ACCOUNT_ID,
  type UsageReport,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import {
  Banner,
  Button,
  confirm,
  ListRow,
  Section,
  Sheet,
  Text,
  TextField,
} from '@openagentspocket/ui';
import { useState } from 'react';
import { RenameField } from './RenameField';
import { renderMessage } from './usageText';
import { useAccountFile } from './useAccountFile';

interface Props {
  visible: boolean;
  onClose: () => void;
  hostId: string;
  hostName: string;
  report: UsageReport;
  store: AccountFileStore;
}

/** usage.accounts-sheet: add, rename, remove and dismiss a Host's Claude Code Accounts. */
export function AccountsSheet({ visible, onClose, hostId, hostName, report, store }: Props) {
  const claude = claudeProgram(report);
  const reported = claude?.accounts ?? [];
  const defaultDirectory = reported.find((a) => a.isDefault)?.directory ?? null;
  const state = useAccountFile(store, hostId, defaultDirectory, visible);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [directory, setDirectory] = useState('');
  const { file } = state;
  const stateLine = (id: string) => {
    const account = reported.find((a) => a.id === id);
    const line = account ? accountStateLine(account) : null;
    return line ? renderMessage(line) : undefined;
  };
  const rows = file
    ? [
        {
          id: DEFAULT_ACCOUNT_ID,
          name: file.defaultName ?? t('Default'),
          directory: defaultDirectory,
        },
        ...file.accounts,
      ]
    : [];
  const counted = new Set([...(file?.accounts ?? []).map((a) => comparablePath(a.directory))]);
  const suggestions = (claude?.accountSuggestions ?? []).filter(
    (s) =>
      !counted.has(comparablePath(s.directory)) &&
      !(file?.ignored ?? []).some((p) => comparablePath(p) === comparablePath(s.directory)) &&
      comparablePath(s.directory) !== comparablePath(defaultDirectory ?? ''),
  );
  const askRemove = async (id: string, name: string) => {
    const ok = await confirm({
      title: t('Remove %@?', name),
      message: t(
        'Its Token Usage and Usage Limits stop showing. The directory and its sign-in stay on %@.',
        hostName,
      ),
      confirmLabel: t('Remove'),
      cancelLabel: t('Cancel'),
      destructive: true,
    });
    if (ok) await state.remove(id);
  };
  const addTyped = async () => {
    if (await state.add({ directory: directory.trim() })) setDirectory('');
  };
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('Claude Code Accounts')}
      detent="large"
      closeLabel={t('Close')}
      testID="usage-accounts-sheet"
    >
      {state.failure ? (
        <Banner
          tone="danger"
          title={t('Couldn’t Change Accounts')}
          message={renderMessage(state.failure)}
          onDismiss={state.dismissFailure}
          testID="accounts-failure"
        />
      ) : null}
      <Section
        grouped
        title={t('Accounts')}
        footer={t('A Host can have up to four Claude Code Accounts. Remove one to add another.')}
      >
        {rows.map((row) =>
          renaming === row.id ? (
            <RenameField
              key={row.id}
              initial={row.name}
              busy={state.busy}
              onCancel={() => setRenaming(null)}
              onSave={async (name) => {
                if (await state.rename(row.id, name)) setRenaming(null);
              }}
            />
          ) : (
            <ListRow
              key={row.id}
              title={row.name}
              subtitle={row.directory ?? undefined}
              value={stateLine(row.id)}
              menu={[
                {
                  key: 'rename',
                  title: t('Rename Account'),
                  icon: 'edit',
                  onPress: () => setRenaming(row.id),
                },
                ...(row.id === DEFAULT_ACCOUNT_ID
                  ? []
                  : [
                      {
                        key: 'remove',
                        title: t('Remove Account'),
                        icon: 'trash' as const,
                        destructive: true,
                        onPress: () => askRemove(row.id, row.name),
                      },
                    ]),
              ]}
              testID={`account-${row.id}`}
            />
          ),
        )}
      </Section>
      {suggestions.length > 0 ? (
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
                    disabled={state.busy || (file?.accounts.length ?? 0) >= ACCOUNT_LIMIT}
                    onPress={() => state.add({ directory: s.directory, name: s.name })}
                    testID={`suggestion-add-${s.name}`}
                  />
                  <Button
                    title={t('Ignore')}
                    size="small"
                    kind="text"
                    disabled={state.busy}
                    onPress={() => state.ignore(s.directory)}
                    testID={`suggestion-ignore-${s.name}`}
                  />
                </>
              }
            />
          ))}
        </Section>
      ) : null}
      <TextField
        label={t('Directory')}
        mono
        value={directory}
        onChangeText={setDirectory}
        autoCapitalize="none"
        autoCorrect={false}
        testID="account-directory"
      />
      <Button
        title={t('Add folder as an Account')}
        kind="secondary"
        disabled={state.busy || directory.trim() === ''}
        onPress={addTyped}
        testID="account-add"
      />
      <Text variant="caption" tone="tertiary">
        {t(
          'The plugin asks Claude Code on this computer for your plan limits. Neither the plugin nor Agentico handles your sign-in. This automated use is not officially supported.',
        )}
      </Text>
    </Sheet>
  );
}
