import {
  type Host,
  type HostConnectionSummary,
  hostConnectionSummary,
  routeSummary,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Badge, ListRow, Section, StatusPill } from '@openagentspocket/ui';
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

/** The routes, with the one in use tagged and, when no route reached the Host, none tagged. */
export function RoutesSection({ host, routeInUse }: { host: Host; routeInUse: string | null }) {
  return (
    <Section title={t('Routes')} count={host.routes.length} testID="routes-section">
      {host.routes.map((route) => (
        <ListRow
          key={route.id}
          title={routeSummary(route)}
          trailing={
            route.id === routeInUse ? <StatusPill status="done" label={t('In Use')} /> : undefined
          }
          testID={`route-row-${route.id}`}
        />
      ))}
    </Section>
  );
}

/** User, session or herdr endpoint, and how the Host authenticates. */
export function HostFacts({ host }: { host: Host }) {
  const summary: HostConnectionSummary = hostConnectionSummary(host);
  return (
    <Section title={t('Host')} testID="host-facts">
      <ListRow title={t('User')} value={host.username} />
      {host.herdrEndpoint ? (
        <>
          <ListRow title={t('herdr Socket')} subtitle={host.herdrEndpoint.socketPath} />
          <ListRow title={t('herdr Launcher')} subtitle={host.herdrEndpoint.executablePath} />
        </>
      ) : (
        <ListRow
          title={t('Session')}
          value={host.sessionName === '' ? t('Default') : host.sessionName}
        />
      )}
      <ListRow
        title={t('Authentication')}
        trailing={
          <Badge
            kind="control"
            label={host.authMethod === 'password' ? t('Password') : t('Device Key')}
          />
        }
        subtitle={summary.kind === 'address' ? summary.text : undefined}
      />
    </Section>
  );
}
