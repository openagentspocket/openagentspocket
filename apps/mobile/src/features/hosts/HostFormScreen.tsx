import {
  canSaveHostDraft,
  type HostDraft,
  hostFromDraft,
  passwordUpdate,
  routeDraftUsesJumpHost,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import {
  Button,
  confirm,
  Icon,
  ListRow,
  type ScreenHeader,
  Section,
  TextField,
} from '@openagentspocket/ui';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { AppScreen } from '@/navigation/AppScreen';
import { AuthFields } from './AuthFields';
import { hostDraftStore, useHostDraft } from './hostDraftStore';
import { hostsRuntime } from './hostsRuntime';
import type { InitialDraft } from './useInitialDraft';

interface HostFormScreenProps {
  initial: InitialDraft;
  /** Called with the saved Host's id; `created` is false when an existing Host was edited. */
  onSaved: (hostId: string, created: boolean) => void;
  onCancel: () => void;
  /** Pushes the route page for the route at `index`. */
  onOpenRoute: (index: number) => void;
  /** Pushes the New Route page. */
  onAddRoute: () => void;
}

/** hosts.form: add, edit or duplicate a Host; validation comes from the core draft rules. */
export function HostFormScreen({
  initial,
  onSaved,
  onCancel,
  onOpenRoute,
  onAddRoute,
}: HostFormScreenProps) {
  const { model } = hostsRuntime();
  const { editing } = initial;
  // The route pages edit this same draft, so it lives in a store for the form's lifetime.
  useState(() => hostDraftStore.set(initial.draft));
  useEffect(() => {
    if (!hostDraftStore.get()) hostDraftStore.set(initial.draft);
    return () => hostDraftStore.set(null);
  }, [initial.draft]);
  const draft: HostDraft = useHostDraft() ?? initial.draft;
  const [saving, setSaving] = useState(false);
  const change = (patch: Partial<HostDraft>) =>
    hostDraftStore.set((current) => ({ ...current, ...patch }));

  const save = async () => {
    const host = hostFromDraft(draft, editing?.id ?? model.newId());
    if (!host || saving) return;
    setSaving(true);
    try {
      await (editing
        ? model.update(host, passwordUpdate(draft))
        : model.add(host, passwordUpdate(draft)));
      onSaved(host.id, editing === null);
    } catch {
      setSaving(false);
      await confirm({
        title: t('Could not save the Host'),
        cancelLabel: null,
        confirmLabel: t('OK'),
      });
    }
  };

  const bar: ScreenHeader = {
    variant: 'sheet',
    title: editing ? t('Edit Host') : t('Add Host'),
    leading: { label: t('Cancel'), onPress: onCancel, testID: 'host-cancel' },
    trailing: [
      {
        label: t('Save'),
        onPress: () => void save(),
        disabled: !canSaveHostDraft(draft, editing) || saving,
        testID: 'host-save',
      },
    ],
  };

  return (
    <AppScreen header={bar} keyboardAvoiding testID="host-form">
      <Section title={t('Host')}>
        <TextField
          inline
          label={t('Name (optional)')}
          value={draft.name}
          onChangeText={(name) => change({ name })}
          testID="host-name"
        />
        <TextField
          inline
          label={t('User')}
          value={draft.username}
          onChangeText={(username) => change({ username })}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="username"
          testID="host-user"
        />
      </Section>
      <Section
        title={t('Routes')}
        footer={t(
          'Add another way to reach this Host, such as its LAN address at home and an overlay network or Jump Host elsewhere.',
        )}
      >
        {draft.routes.map((route, index) => (
          <ListRow
            key={route.id}
            title={route.address.trim() === '' ? t('Route %lld', index + 1) : route.address.trim()}
            titleMono={route.address.trim() !== ''}
            subtitle={routeDraftUsesJumpHost(route) ? t('Jump Host') : t('Direct')}
            leading={
              <View style={{ width: 28, alignItems: 'center' }}>
                <Icon name="wifi" size={22} color="accent" />
              </View>
            }
            chevron
            onPress={() => onOpenRoute(index)}
            testID={`route-${index}`}
          />
        ))}
        <Button
          kind="text"
          icon="add"
          title={t('Add Route')}
          onPress={onAddRoute}
          testID="host-add-route"
        />
      </Section>
      <AuthFields
        draft={draft}
        keepsPassword={editing?.authMethod === 'password'}
        onChange={change}
      />
    </AppScreen>
  );
}
