import { type Host, primaryRoute, routeEndpoint, routeUsesJumpHost } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Icon, KeyValueGroup, ListRow, Section, StatusPill } from '@openagentspocket/ui';
import { View } from 'react-native';
import type { HostConnection } from './HostsModel';

export function connectionTitle(connection: HostConnection): string {
  switch (connection) {
    case 'connected':
      return t('Connected');
    case 'connecting':
      return t('Connecting…');
    case 'cantConnect':
      return t("Can't Connect");
    case 'notConnected':
      return t('Not Connected');
  }
}

const routeKind = (host: Host, id: string): string => {
  const route = host.routes.find((r) => r.id === id);
  return route && routeUsesJumpHost(route) ? t('Jump Host') : t('Direct');
};

/** "address · Direct": the status card's second line, for the route in use or the first one. */
export function routeLine(host: Host, routeInUse: string | null): string {
  const route = host.routes.find((r) => r.id === routeInUse) ?? primaryRoute(host);
  return `${routeEndpoint(route)} · ${routeKind(host, route.id)}`;
}

/** The routes: glyph tile, mono address, how it connects, and the one in use tagged. */
export function RoutesSection({ host, routeInUse }: { host: Host; routeInUse: string | null }) {
  return (
    <Section title={t('Routes')} testID="routes-section">
      {host.routes.map((route) => (
        <ListRow
          key={route.id}
          title={routeEndpoint(route)}
          titleMono
          subtitle={routeKind(host, route.id)}
          leading={
            <View style={{ width: 28, alignItems: 'center' }}>
              <Icon name="wifi" size={22} color="accent" />
            </View>
          }
          trailing={
            route.id === routeInUse ? <StatusPill status="done" label={t('In Use')} /> : undefined
          }
          testID={`route-row-${route.id}`}
        />
      ))}
    </Section>
  );
}

/** Account, session or herdr endpoint, and how the Host authenticates. */
export function HostFacts({ host }: { host: Host }) {
  const endpoint = host.herdrEndpoint;
  const rows = [
    { label: t('Account'), value: host.username },
    endpoint
      ? { label: t('herdr Socket'), value: endpoint.socketPath, mono: true }
      : { label: t('Session'), value: host.sessionName === '' ? t('Default') : host.sessionName },
    ...(endpoint
      ? [{ label: t('herdr Launcher'), value: endpoint.executablePath, mono: true }]
      : []),
    { label: t('Auth'), value: host.authMethod === 'password' ? t('Password') : t('Device Key') },
  ];
  return <KeyValueGroup title={t('Host')} rows={rows} testID="host-facts" />;
}
