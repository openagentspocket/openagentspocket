import {
  canSaveHostDraft,
  emptyRouteDraft,
  type HostDraft,
  hostFromDraft,
  passwordUpdate,
  removeRoutes,
  updateRoute,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Button, confirm, Screen, Section, TextField } from '@openagentspocket/ui';
import { useState } from 'react';
import { AuthFields } from './AuthFields';
import { hostsRuntime } from './hostsRuntime';
import { RouteFields } from './RouteFields';
import type { InitialDraft } from './useInitialDraft';

interface HostFormScreenProps {
  initial: InitialDraft;
  /** Called with the saved Host's id; `created` is false when an existing Host was edited. */
  onSaved: (hostId: string, created: boolean) => void;
  onCancel: () => void;
}

/** hosts.form: add, edit or duplicate a Host; validation comes from the core draft rules. */
export function HostFormScreen({ initial, onSaved, onCancel }: HostFormScreenProps) {
  const { model } = hostsRuntime();
  const { editing } = initial;
  const [draft, setDraft] = useState<HostDraft>(initial.draft);
  const [saving, setSaving] = useState(false);
  const change = (patch: Partial<HostDraft>) => setDraft((current) => ({ ...current, ...patch }));

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

  return (
    <Screen edges={['left', 'right', 'bottom']} keyboardAvoiding testID="host-form">
      <Section title={t('Host')} grouped={false}>
        <TextField
          label={t('Name (optional)')}
          value={draft.name}
          onChangeText={(name) => change({ name })}
          testID="host-name"
        />
        <TextField
          label={t('User')}
          value={draft.username}
          onChangeText={(username) => change({ username })}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="username"
          mono
          testID="host-user"
        />
      </Section>
      <Section title={t('Routes')} grouped={false}>
        {draft.routes.map((route, index) => (
          <RouteFields
            key={route.id}
            route={route}
            index={index}
            canDelete={draft.routes.length > 1}
            onChange={(patch) => setDraft((current) => updateRoute(current, route.id, patch))}
            onDelete={() => setDraft((current) => removeRoutes(current, [index]))}
          />
        ))}
        <Button
          kind="secondary"
          icon="add"
          title={t('Add Route')}
          onPress={() => change({ routes: [...draft.routes, emptyRouteDraft(model.newId())] })}
          testID="host-add-route"
        />
      </Section>
      <AuthFields
        draft={draft}
        keepsPassword={editing?.authMethod === 'password'}
        onChange={change}
      />
      <Button
        title={t('Save')}
        onPress={() => void save()}
        disabled={!canSaveHostDraft(draft, editing)}
        loading={saving}
        testID="host-save"
      />
      <Button kind="text" title={t('Cancel')} onPress={onCancel} testID="host-cancel" />
    </Screen>
  );
}
