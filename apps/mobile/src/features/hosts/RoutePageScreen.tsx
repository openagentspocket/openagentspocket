import {
  emptyRouteDraft,
  type HostRouteDraft,
  parsePort,
  removeRoutes,
  updateRoute,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Button, Icon, ListRow, type ScreenHeader, Section, Text } from '@openagentspocket/ui';
import { useEffect, useState } from 'react';
import { AppScreen } from '@/navigation/AppScreen';
import { hostDraftStore, useHostDraft } from './hostDraftStore';
import { hostsRuntime } from './hostsRuntime';
import { PeerChooser } from './PeerChooser';
import { RouteFields } from './RouteFields';

interface RoutePageScreenProps {
  /** The route to edit in the form's draft, or `new` for the New Route page. */
  index: number | 'new';
  onBack: () => void;
  /** Opens with the peer picker presented (atlas and tests). */
  initiallyPicking?: boolean;
}

/**
 * hosts.route-page / hosts.new-route: one route of the Host form on its own page. Edits to an
 * existing route are live in the form's draft (no Save, as in Swift); New Route adds its route
 * to the draft on Save and adds nothing on Back.
 */
export function RoutePageScreen({ index, onBack, initiallyPicking = false }: RoutePageScreenProps) {
  const draft = useHostDraft();
  const [fresh, setFresh] = useState<HostRouteDraft>(() =>
    emptyRouteDraft(hostsRuntime().model.newId()),
  );
  const [picking, setPicking] = useState(initiallyPicking);
  const isNew = index === 'new';
  const route = isNew ? fresh : draft?.routes[index];

  // The form was left (or never opened): nothing to edit.
  useEffect(() => {
    if (!isNew && draft && !route) onBack();
  }, [isNew, draft, route, onBack]);

  if (!route || !draft) return <AppScreen testID="route-page-empty">{null}</AppScreen>;

  const change = (patch: Partial<Omit<HostRouteDraft, 'id'>>) => {
    if (isNew) setFresh((current) => ({ ...current, ...patch }));
    else hostDraftStore.set((current) => updateRoute(current, route.id, patch));
  };
  const valid = route.address.trim() !== '' && parsePort(route.port) !== null;
  const peers = hostsRuntime().peers;
  const prefix = isNew ? 'new-route' : `route-${index}`;

  const bar: ScreenHeader = {
    variant: 'sheet',
    title: isNew ? t('New Route') : t('Route %lld', (index as number) + 1),
    back: true,
    leading: { label: t('Back'), onPress: onBack, testID: 'route-back' },
    trailing: isNew
      ? [
          {
            label: t('Save'),
            disabled: !valid,
            onPress: () => {
              hostDraftStore.set((current) => ({
                ...current,
                routes: [...current.routes, fresh],
              }));
              onBack();
            },
            testID: 'route-save',
          },
        ]
      : [],
  };
  return (
    <AppScreen header={bar} testID={isNew ? 'new-route-page' : 'route-page'}>
      <Section title={t('Network')} footer={t("Direct uses this device's own network connection.")}>
        <ListRow
          title={t('Network')}
          trailing={
            <>
              <Text tone="accent">{t('Direct')}</Text>
              <Icon name="chevronUpDown" size={13} color="accent" />
            </>
          }
          testID={`${prefix}-network`}
        />
        {peers ? (
          <ListRow
            icon="wifi"
            title={peers.kind === 'tailnet' ? t('Choose from Tailnet…') : t('Choose from Network…')}
            chevron
            onPress={() => setPicking(true)}
            testID={`${prefix}-choose-peer`}
          />
        ) : null}
      </Section>
      <RouteFields route={route} onChange={change} testIDPrefix={prefix} />
      {isNew ? null : (
        <Button
          kind="text"
          icon="trash"
          title={t('Delete Route')}
          disabled={draft.routes.length < 2}
          onPress={() => {
            hostDraftStore.set((current) => removeRoutes(current, [index as number]));
            onBack();
          }}
          testID={`${prefix}-delete`}
        />
      )}
      {peers ? (
        <PeerChooser
          visible={picking}
          onClose={() => setPicking(false)}
          currentAddress={route.address}
          onPick={(address, name) => {
            change({ address });
            if (draft.name.trim() === '') hostDraftStore.set((c) => ({ ...c, name }));
            setPicking(false);
          }}
        />
      ) : null}
    </AppScreen>
  );
}
