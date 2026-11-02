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
import { Banner, confirm, Section, Sheet } from '@openagentspocket/ui';
import { useState } from 'react';
import { AccountRow } from './AccountRow';
import { AccountSuggestions } from './AccountSuggestions';
import { AddAccountForm } from './AddAccountForm';
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
        {rows.map((row) => (
          <AccountRow
            key={row.id}
            id={row.id}
            name={row.name}
            directory={row.directory}
            stateLine={stateLine(row.id)}
            renaming={renaming === row.id}
            busy={state.busy}
            onStartRename={() => setRenaming(row.id)}
            onCancelRename={() => setRenaming(null)}
            onRename={async (name) => {
              if (await state.rename(row.id, name)) setRenaming(null);
            }}
            onRemove={() => askRemove(row.id, row.name)}
          />
        ))}
      </Section>
      <AccountSuggestions
        suggestions={suggestions}
        busy={state.busy}
        atLimit={(file?.accounts.length ?? 0) >= ACCOUNT_LIMIT}
        onAdd={(s) => state.add({ directory: s.directory, name: s.name })}
        onIgnore={state.ignore}
      />
      <AddAccountForm busy={state.busy} onAdd={(directory) => state.add({ directory })} />
    </Sheet>
  );
}
