import { systemClock } from '@openagentspocket/transport';
import { router } from 'expo-router';
import { deviceServices } from '@/connections/deviceServices';
import { hrefs } from '@/navigation/hrefs';
import { deviceStorage } from '@/settings/deviceStorage';
import { type Composition, createComposition } from './createComposition';

let composition: Composition | undefined;

/** The app's one composition, built on first use over the device services. */
export function deviceComposition(): Composition {
  if (!composition) {
    const services = deviceServices();
    composition = createComposition({
      access: services.manager,
      console: services.store,
      hosts: () => services.runtime.model.getSnapshot().hosts,
      storage: deviceStorage,
      clock: systemClock,
      openAgent: (hostId, paneId) => router.push(hrefs.agent(hostId, paneId)),
      openChanges: (hostId, directory) => router.push(hrefs.changesForDirectory(hostId, directory)),
    });
  }
  return composition;
}
