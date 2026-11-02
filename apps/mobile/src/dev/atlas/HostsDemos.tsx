import { hostDraftFromHost } from '@openagentspocket/core';
import { useEffect, useState } from 'react';
import HostFormRoute from '@/app/hosts/form';
import { askReplaceDeviceKey } from '@/features/hosts/DeviceKeyLine';
import { HostDetailScreen } from '@/features/hosts/HostDetailScreen';
import { hostDraftStore } from '@/features/hosts/hostDraftStore';
import { hostsRuntime } from '@/features/hosts/hostsRuntime';
import { RoutePageScreen } from '@/features/hosts/RoutePageScreen';
import { DEMO_HOSTS } from './AtlasFrame';

const noop = () => {};

/** A route page over the form's draft, as when the Demo Host's form is open (hosts.route-page). */
export function RoutePageDemo({
  isNew = false,
  picking = false,
}: {
  isNew?: boolean;
  picking?: boolean;
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const host = hostsRuntime().model.find(DEMO_HOSTS[0]?.id ?? '') ?? DEMO_HOSTS[0];
    if (host) hostDraftStore.set(hostDraftFromHost(host));
    setReady(true);
    return () => hostDraftStore.set(null);
  }, []);
  if (!ready) return null;
  return <RoutePageScreen index={isNew ? 'new' : 0} onBack={noop} initiallyPicking={picking} />;
}

/** The plugin notice over a Host whose plugin is old (hosts.plugin-notice). */
export function PluginNoticeDemo() {
  return (
    <HostDetailScreen
      hostId="demo"
      onBack={noop}
      onEdit={noop}
      onRemoved={noop}
      initiallyShowingPluginNotice
    />
  );
}

/** The form with the Replace Device Key confirmation open (hosts.replace-auth-key-confirm). */
export function ReplaceKeyDemo() {
  useEffect(() => {
    void askReplaceDeviceKey();
  }, []);
  return <HostFormRoute />;
}
