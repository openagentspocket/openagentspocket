import { type Host, hostRoute } from '@openagentspocket/core';
import { OverlayHost, ThemeProvider } from '@openagentspocket/ui';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { type ReactElement, useState } from 'react';
import { HostFormScreen } from './HostFormScreen';
import { DemoHostProbe } from './HostProbe';
import { createDemoRuntime, setHostsRuntime } from './hostsRuntime';
import { DemoPairingConnector } from './pairingAdapters';
import { RoutePageScreen } from './RoutePageScreen';
import { useInitialDraft } from './useInitialDraft';

export const probe = new DemoHostProbe();

/** Opens route 0's page, types the address (and port) there, and returns to the form. */
export async function fillRoute(address: string, port?: string) {
  await fireEvent.press(screen.getByTestId('route-0'));
  await fireEvent.changeText(screen.getByTestId('route-0-address'), address);
  if (port) await fireEvent.changeText(screen.getByTestId('route-0-port'), port);
  await fireEvent.press(screen.getByTestId('route-back'));
}

export function setup() {
  const runtime = createDemoRuntime({ probe, connector: new DemoPairingConnector(0) });
  setHostsRuntime(runtime);
  return runtime;
}

export async function renderApp(ui: ReactElement): Promise<void> {
  await render(
    <ThemeProvider themeId="indigo">
      <OverlayHost />
      {ui}
    </ThemeProvider>,
  );
}

export const SAMPLE: Host = {
  id: 'h1',
  name: 'Workshop',
  username: 'ada',
  authMethod: 'deviceKey',
  sessionName: '',
  herdrEndpoint: null,
  routes: [hostRoute({ id: 'r1', address: 'workshop.example' })],
};

/** The form and the route pages it pushes, as the Hosts stack lays them out. */
export function Form({ onSaved }: { onSaved: (id: string, created: boolean) => void }) {
  const initial = useInitialDraft();
  const [page, setPage] = useState<number | 'new' | null>(null);
  if (!initial) return null;
  // A pushed screen sits over the form, which stays mounted under it.
  return (
    <>
      <HostFormScreen
        initial={initial}
        onSaved={onSaved}
        onCancel={() => {}}
        onOpenRoute={setPage}
        onAddRoute={() => setPage('new')}
      />
      {page === null ? null : <RoutePageScreen index={page} onBack={() => setPage(null)} />}
    </>
  );
}
